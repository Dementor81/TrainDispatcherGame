using System;
using System.Threading.Tasks;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Logging;

namespace TrainDispatcherGame.Server.Simulation
{
    public class TrainEventProcessor
    {
        private readonly Simulation _simulation;
        private readonly NotificationManager _notificationManager;
        private readonly PlayerManager _playerManager;
        private readonly TrackLayoutService _trackLayoutService;
        private readonly OpenLineTrackRegistry _openLineTracks;

        public TrainEventProcessor(Simulation simulation,
                                   NotificationManager notificationManager,
                                   PlayerManager playerManager,
                                   TrackLayoutService trackLayoutService,
                                   OpenLineTrackRegistry trackRegistry)
        {
            _simulation = simulation;
            _notificationManager = notificationManager;
            _playerManager = playerManager;
            _trackLayoutService = trackLayoutService;
            _openLineTracks = trackRegistry;
        }

        private string Ctx(string context) => SessionLogContext.Prefix(_simulation.SessionId, context);

        /// <summary>
        /// Creates a new train spawn event from a connection. Also calculates delay (seconds; negative if early).
        /// </summary>
        /// <param name="train">The train to spawn.</param>
        /// <param name="connection">The connection to spawn the train on.</param>
        /// <param name="isReversed">Whether the train is traveling in the reverse direction of the connection.</param>
        /// <param name="additionalDistance">the distance to travel before the train reaches the connection. Only used for uncontrolled stations because the train doesnt actually moves to the exit point</param>
        /// <param name="planedDepartureTime">The planned departure time of the train.</param>
        /// <returns>The new train spawn event.</returns>
        public TrainSpawnEvent CreateSpawnFromConnection(Train train, NetworkConnection connection, bool isReversed, int additionalDistance, DateTime planedDepartureTime)
        {
            var simTime = _simulation.SimulationTime;
            var actualDepartureTime = planedDepartureTime > simTime ? planedDepartureTime : simTime;
            var arrivalTime = actualDepartureTime.AddSeconds(train.GetTravelTime(connection.Distance + additionalDistance));
            train.delay = (int)(actualDepartureTime - planedDepartureTime).TotalSeconds;
            _simulation.NotifyTrainDelayUpdated(train);

            return new TrainSpawnEvent(arrivalTime, connection, isReversed);
        }

        public async Task HandleTrainEvent(Train train)
        {
            if (train.TrainEvent == null) throw new Exception($"Train {train.Number} has no train event");

            if (train.TrainEvent.IsDue(_simulation.SimulationTime))
            {
                train.TrainEvent.Processed = true;
                if (train.TrainEvent is TrainSpawnEvent)
                    await this.HandleTrainSpawn(train);
                else if (train.TrainEvent is TrainStartEvent)
                    this.HandleTrainStart(train);
                else if (train.TrainEvent is RetryDispatchEvent)
                    AdvanceTrainToNextStation(train);
                else if (train.TrainEvent is TrainWaitEvent)
                    DispatchTrainByServer(train);
            }
        }

        public async Task HandleTrainSpawn(Train train)
        {
            if (train.TrainEvent is not TrainSpawnEvent spawn) throw new Exception($"Train {train.Number} next event is not a spawn event");

            var station = spawn.HeadingStation;
            var exitPointId = spawn.HeadingExitId;

            if (_playerManager.IsStationControlled(station))
            {
                // DO NOT remove train from open-line track yet
                // Will be removed when client reports exit is unblocked
                if (exitPointId == -1) throw new Exception($"Train {train.Number} has invalid exit point id -1 for player controlled station");
                await _notificationManager.SendTrain(station, train, exitPointId);
                train.controlledByPlayer = true;
                train.CurrentLocation = station?.ToLowerInvariant() ?? string.Empty;
                train.TrainEvent = null;
                ServerLogger.Instance.LogDebug(Ctx(train.Number), $"Train sent to station {station} and is controlled by player");
                return;
            }
            else
            {
                _openLineTracks.RemoveTrain(spawn.Connection);
                ServerLogger.Instance.LogDebug(Ctx(train.Number), $"handling train spawn at uncontrolled station {station}, train removed from open line track");
                // If the train is coming from a player controlled station, notify the player that its exit is unblocked
                var previousWaypoint = train.GetPreviousWayPoint();
                if (previousWaypoint != null)
                {
                    string fromStation = previousWaypoint.Station;
                    if (_playerManager.IsStationControlled(fromStation))
                    {
                        // Notify the player at fromStation that the exit to station is unblocked
                        await _notificationManager.SendExitBlockStatus(fromStation, spawn.CommingFromExitId, false);
                    }
                }
                var currentWaypoint = train.GetCurrentWayPoint();
                if (currentWaypoint != null)
                {
                    if (currentWaypoint.IsLast)
                    {
                        ServerLogger.Instance.LogDebug(Ctx(train.Number), $"Train {train.Number} has completed all events");
                        train.completed = true;
                        return;
                    }
                    if (currentWaypoint.DepartureTime > _simulation.SimulationTime)
                    {
                        train.TrainEvent = new TrainWaitEvent(currentWaypoint.DepartureTime);
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} waiting at {currentWaypoint.Station} until {currentWaypoint.DepartureTime:HH:mm:ss}");
                        return;
                    }
                    else
                    {
                        DispatchTrainByServer(train);
                    }
                }
                else
                {
                    ServerLogger.Instance.LogError(Ctx(train.Number), $"Train {train.Number} has no current waypoint");
                    train.completed = true;
                    train.damaged = true;
                    return;
                }
            }
        }

        public void HandleTrainStart(Train train)
        {
            var firstWaypoint = train.GetCurrentWayPoint();
            if (!string.IsNullOrWhiteSpace(train.PredecessorTrainNumber))
            {
                var predecessor = _simulation.FindTrainByNumber(train.PredecessorTrainNumber);
                if (predecessor != null && !predecessor.completed)
                {
                    train.TrainEvent = new TrainStartEvent(_simulation.SimulationTime.AddMinutes(1), firstWaypoint?.Station ?? string.Empty);
                    ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train start delayed until {train.TrainEvent.ScheduledTime:HH:mm:ss} because predecessor {predecessor.Number} is not completed");
                    return;
                }

                if (firstWaypoint != null && _playerManager.IsStationControlled(firstWaypoint.Station))
                {
                    train.TrainEvent = null;
                    train.controlledByPlayer = true;
                    train.CurrentLocation = firstWaypoint.Station?.ToLowerInvariant() ?? string.Empty;
                    ServerLogger.Instance.LogDebug(Ctx(train.Number), $"Train start skipped because predecessor {train.PredecessorTrainNumber} is handled by the player at {firstWaypoint.Station}");
                    return;
                }
            }

            ServerLogger.Instance.LogDebug(Ctx(train.Number), $"train started");
            DispatchTrainByServer(train);
        }

        /// <summary>
        /// Called when a train moves from an uncontrolled station to the next station.
        /// Its not being called when a train moves from a player controlled station to the next station.
        /// </summary>
        /// <param name="train"></param>
        /// <exception cref="Exception"></exception>
        public void AdvanceTrainToNextStation(Train train)
        {
            var currentWaypoint = train.GetCurrentWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            ServerLogger.Instance.LogDebug(Ctx(train.Number), $"advancing train to next station {nextWaypoint?.Station ?? "none"}");
            if (currentWaypoint == null || nextWaypoint == null) throw new Exception($"Train {train.Number} waypoints invalid");

            var layout = _trackLayoutService.GetTrackLayout(currentWaypoint.Station); //layout could be null if the train is at a virtual station at the margin of the map
            bool isReversed;
            var connection = _trackLayoutService.GetRegularConnectionToStation(currentWaypoint.Station, nextWaypoint.Station, out isReversed);
            var distanceToExit = 0;
            if (connection == null) throw new Exception($"No regular connection found for train {train.Number} from {currentWaypoint.Station} to {nextWaypoint.Station}");
            if (layout != null) distanceToExit = layout.MaxExitDistance / 2;

            // Check if track is occupied
            if (_openLineTracks.TryGet(connection, out var track) && track.TrainOnTrack != null)
            {
                var blockingTrain = track.TrainOnTrack;
                var retryTime = blockingTrain.TrainEvent?.ScheduledTime.AddSeconds(20) ?? _simulation.SimulationTime.AddSeconds(20);
                train.TrainEvent = new RetryDispatchEvent(retryTime);
                train.CurrentLocation = currentWaypoint.Station;

                var heldDelay = (int)Math.Max(0, (_simulation.SimulationTime - currentWaypoint.DepartureTime).TotalSeconds);
                if (heldDelay != train.delay)
                {
                    train.delay = heldDelay;
                    _simulation.NotifyTrainDelayUpdated(train);
                }

                ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train dispatch delayed until {retryTime:HH:mm:ss} - connection blocked by train {blockingTrain.Number}");
                return;
            }

            var spawn = CreateSpawnFromConnection(train, connection, isReversed, distanceToExit, currentWaypoint.DepartureTime);

            var headingStation = spawn.HeadingStation;

            if (_playerManager.IsStationControlled(headingStation))
            {
                // Notify the player at the station that the exit is now blocked
                _notificationManager.SendExitBlockStatus(headingStation, spawn.HeadingExitId, true).Wait();
            }

            train.TrainEvent = spawn;
            train.AdvanceToNextWayPoint(); //advance to the next waypoint
            train.CurrentLocation = null;
            _openLineTracks.AddTrain(connection, train); //add the train to the track registry
            ServerLogger.Instance.LogDebug(Ctx(train.Number), $"train added to track registry at {connection.FromStation} to {connection.ToStation}");
        }

        public void DispatchTrainByServer(Train train)
        {
            var nextWaypoint = train.GetNextWayPoint();
            if (nextWaypoint == null)
            {
                train.completed = true;
                ServerLogger.Instance.LogDebug(Ctx(train.Number), $"train completed");
                return;
            }
            ServerLogger.Instance.LogDebug(Ctx(train.Number), $"dispatching train to next station {nextWaypoint.Station}");
            AdvanceTrainToNextStation(train);
        }
    }
}
