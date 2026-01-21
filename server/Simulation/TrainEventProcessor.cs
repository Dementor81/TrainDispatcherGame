using System;
using System.Threading.Tasks;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Services;

namespace TrainDispatcherGame.Server.Simulation
{
    public class TrainEventProcessor
    {
        private readonly NotificationManager _notificationManager;
        private readonly PlayerManager _playerManager;
        private readonly TrackLayoutService _trackLayoutService;
        private readonly OpenLineTrackRegistry _openLineTracks;

        public TrainEventProcessor(NotificationManager notificationManager,
                                   PlayerManager playerManager,
                                   TrackLayoutService trackLayoutService,
                                   OpenLineTrackRegistry trackRegistry)
        {
            _notificationManager = notificationManager;
            _playerManager = playerManager;
            _trackLayoutService = trackLayoutService;
            _openLineTracks = trackRegistry;
        }

        public DateTime SimulationTime { get; set; }

        /// <summary>
        /// Creates a new train spawn event from a connection. Also calculates the delay of the train.
        /// </summary>
        /// <param name="train">The train to spawn.</param>
        /// <param name="connection">The connection to spawn the train on.</param>
        /// <param name="isReversed">Whether the train is traveling in the reverse direction of the connection.</param>
        /// <param name="additionalDistance">the distance to travel before the train reaches the connection. Only used for uncontrolled stations because the train doesnt actually moves to the exit point</param>
        /// <param name="planedDepartureTime">The planned departure time of the train.</param>
        /// <returns>The new train spawn event.</returns>
        public TrainSpawnEvent CreateSpawnFromConnection(Train train, NetworkConnection connection, bool isReversed, int additionalDistance, DateTime planedDepartureTime)
        {
            var actualDepartureTime = planedDepartureTime > SimulationTime ? planedDepartureTime : SimulationTime;
            var arrivalTime = actualDepartureTime.AddSeconds(train.GetTravelTime(connection.Distance + additionalDistance));
            train.delay = (int)Math.Max(0, (actualDepartureTime - planedDepartureTime).TotalSeconds);
            return new TrainSpawnEvent(arrivalTime, connection, isReversed);
        }

        public async Task HandleTrainEvent(Train train)
        {
            if (train.TrainEvent == null) throw new Exception($"Train {train.Number} has no train event");

            if (train.TrainEvent.IsDue(this.SimulationTime))
            {
                if (train.TrainEvent is TrainSpawnEvent)
                    await this.HandleTrainSpawn(train);
                else if (train.TrainEvent is SendApprovalEvent)
                    await this.HandleSendApproval(train);
                else if (train.TrainEvent is TrainStartEvent)
                    await this.HandleTrainStart(train);
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
                return;
            }else{
                // Uncontrolled station: remove immediately as before
                _openLineTracks.RemoveTrain(spawn.Connection);
                
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
                await DispatchTrainByServer(train);
            }
        }

        public async Task HandleSendApproval(Train train)
        {
            var sendApprovalEvent = train.TrainEvent as SendApprovalEvent;
            if (sendApprovalEvent == null) throw new Exception($"Train {train.Number} next event is not a send approval event");
            if (sendApprovalEvent.ApprovalSent) return;

            var currentWaypoint = train.GetCurrentWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            if (currentWaypoint == null || nextWaypoint == null) throw new Exception($"Train {train.Number} cannot request approval without valid waypoints");

            // Check if the connection to the next station is blocked
            var connection = _trackLayoutService.GetRegularConnectionToStation(currentWaypoint.Station, nextWaypoint.Station, out bool isReversed);
            if (connection != null && _openLineTracks.TryGet(connection, out var track))
            {
                if (track.TrainOnTrack != null)
                {
                    // Connection is blocked, reschedule approval request using the blocking train's event time
                    var blockingTrain = track.TrainOnTrack;
                    if (blockingTrain.TrainEvent != null)
                    {
                        sendApprovalEvent.ScheduledTime = blockingTrain.TrainEvent.ScheduledTime.AddSeconds(20);
                        Console.WriteLine($"Train {train.Number} approval delayed until {blockingTrain.TrainEvent.ScheduledTime:HH:mm:ss} - connection to {nextWaypoint.Station} blocked by train {blockingTrain.Number}");
                    }                    
                    return;
                }
            }

            await _notificationManager.SendApprovalRequest(nextWaypoint.Station, currentWaypoint.Station, train.Number);
            sendApprovalEvent.ApprovalSent = true;
        }

        public async Task HandleTrainStart(Train train)
        {
            await DispatchTrainByServer(train);
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
            if (currentWaypoint == null || nextWaypoint == null) throw new Exception($"Train {train.Number} waypoints invalid");

            var layout = _trackLayoutService.GetTrackLayout(currentWaypoint.Station); //layout could be null if the train is at a virtual station at the margin of the map
            bool isReversed;
            var connection = _trackLayoutService.GetRegularConnectionToStation(currentWaypoint.Station, nextWaypoint.Station, out isReversed);
            var distanceToExit = 0;
            if (connection == null) throw new Exception($"No regular connection found for train {train.Number} from {currentWaypoint.Station} to {nextWaypoint.Station}");
            if (layout != null) distanceToExit = layout.MaxExitDistance / 2;

            var spawn = CreateSpawnFromConnection(train, connection, isReversed, distanceToExit, currentWaypoint.DepartureTime);

            var headingStation = spawn.HeadingStation;

            if (_playerManager.IsStationControlled(headingStation))
            {
                // Notify the player at the station that the exit is now blocked
                _notificationManager.SendExitBlockStatus(headingStation, spawn.HeadingExitId, true).Wait();
            }

            train.TrainEvent = spawn;
            train.AdvanceToNextWayPoint(); //advance to the next waypoint
            _openLineTracks.AddTrain(connection, train); //add the train to the track registry
        }

        public async Task DispatchTrainByServer(Train train)
        {
            var currentWaypoint = train.GetCurrentWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            if (currentWaypoint == null) throw new Exception($"Train {train.Number} has no current way point");
            if (nextWaypoint == null) throw new Exception($"Train {train.Number} has no next way point");

            if (nextWaypoint.IsLast)
            {
                train.completed = true;
                return;
            }

            var requiresApproval = _playerManager.IsStationControlled(nextWaypoint.Station);
            if (requiresApproval)
            {
                var approvalTime = currentWaypoint.DepartureTime.AddSeconds(-60 + train.delay);
                var arrivalWithDelay = currentWaypoint.ArrivalTime.AddSeconds(train.delay);
                if (approvalTime < arrivalWithDelay)
                    approvalTime = arrivalWithDelay;

                train.TrainEvent = new SendApprovalEvent(approvalTime);
                return;
            }

            AdvanceTrainToNextStation(train);
        }
    }
}


