using System;
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
        public TrainSpawnEvent CreateSpawnFromConnection(Train train, NetworkConnection connection, bool isReversed, int additionalDistance, DateTime planedDepartureTime)
        {
            var simTime = _simulation.SimulationTime;
            var actualDepartureTime = planedDepartureTime > simTime ? planedDepartureTime : simTime;
            var arrivalTime = actualDepartureTime.AddSeconds(train.GetTravelTime(connection.Distance + additionalDistance));

            return new TrainSpawnEvent(arrivalTime, connection, isReversed);
        }

        public void HandleTrainEvent(Train train)
        {
            if (train.TrainEvent == null) throw new Exception($"Train {train.Number} has no train event");

            if (!train.TrainEvent.IsDue(_simulation.SimulationTime))
            {
                return;
            }

            if (train.TrainEvent is TrainSpawnEvent)
                HandleTrainSpawn(train);
            else if (train.TrainEvent is SendApprovalEvent)
                HandleSendApproval(train);
            else if (train.TrainEvent is TrainStartEvent)
                HandleTrainStart(train);
            else if (train.TrainEvent is RetryDispatchEvent)
                AdvanceTrainToNextStation(train);
            else if (train.TrainEvent is TrainWaitEvent)
                DispatchTrainByServer(train);
        }

        public void HandleTrainSpawn(Train train)
        {
            if (train.TrainEvent is not TrainSpawnEvent spawn) throw new Exception($"Train {train.Number} next event is not a spawn event");

            var station = spawn.HeadingStation;
            var exitPointId = spawn.HeadingExitId;

            if (_playerManager.IsStationControlled(station))
            {
                // DO NOT remove train from open-line track yet
                // Will be removed when client reports exit is unblocked
                if (exitPointId == -1) throw new Exception($"Train {train.Number} has invalid exit point id -1 for player controlled station");
                if (train.GetCurrentWayPoint() == null) throw new Exception($"Train {train.Number} has no current way point");
                _ = _notificationManager.SendTrain(station, train, exitPointId);
                train.controlledByPlayer = true;
                train.CurrentLocation = station?.ToLowerInvariant() ?? string.Empty;
                train.Record(new TrainHandedToPlayerEvent(_simulation.SimulationTime, station ?? string.Empty, exitPointId));
                train.TrainEvent = null;
                return;
            }

            _openLineTracks.RemoveTrain(spawn.Connection);
            DispatchWaitingTrain(spawn.Connection);
            // If the train is coming from a player controlled station, notify the player that its exit is unblocked
            var previousWaypoint = train.GetPreviousWayPoint();
            if (previousWaypoint != null)
            {
                string fromStation = previousWaypoint.Station;
                if (_playerManager.IsStationControlled(fromStation))
                {
                    _simulation.ClearExitBlocked(fromStation, spawn.CommingFromExitId);
                    _ = _notificationManager.SendExitBlockStatus(fromStation, spawn.CommingFromExitId, false);
                }
            }
            var currentWaypoint = train.GetCurrentWayPoint();
            if (currentWaypoint != null)
            {
                currentWaypoint.ActualArrivalTime = _simulation.SimulationTime;
                if (currentWaypoint.IsLast)
                {
                    _simulation.RefreshTrainDelay(train, forceNotify: true);
                    train.Record(new TrainCompletedEvent(_simulation.SimulationTime));
                    train.completed = true;
                    return;
                }
                if (currentWaypoint.DepartureTime > _simulation.SimulationTime)
                {
                    train.TrainEvent = new TrainWaitEvent(currentWaypoint.DepartureTime, currentWaypoint.Station);
                    _simulation.RefreshTrainDelay(train, forceNotify: true);
                    return;
                }

                DispatchTrainByServer(train);
            }
            else
            {
                ServerLogger.Instance.LogError(Ctx(train.Number), $"Train {train.Number} has no current waypoint");
                _simulation.RefreshTrainDelay(train);
                train.completed = true;
                train.damaged = true;
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
                    return;
                }

                if (firstWaypoint != null && _playerManager.IsStationControlled(firstWaypoint.Station))
                {
                    _ = _notificationManager.SendTrain(firstWaypoint.Station, train);
                    train.Record(new TrainHandedToPlayerEvent(_simulation.SimulationTime, firstWaypoint.Station));
                    train.TrainEvent = null;
                    train.controlledByPlayer = true;
                    train.CurrentLocation = firstWaypoint.Station?.ToLowerInvariant() ?? string.Empty;
                    return;
                }
            }

            DispatchTrainByServer(train);
        }

        public void HandleSendApproval(Train train)
        {
            var sendApprovalEvent = train.TrainEvent as SendApprovalEvent;
            if (sendApprovalEvent == null) throw new Exception($"Train {train.Number} next event is not a send approval event");
            if (sendApprovalEvent.ApprovalSent)
            {
                sendApprovalEvent.Processed = true;
                return;
            }

            var currentWaypoint = train.GetCurrentWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            if (currentWaypoint == null || nextWaypoint == null) throw new Exception($"Train {train.Number} cannot request approval without valid waypoints");

            if (!_playerManager.IsStationControlled(nextWaypoint.Station))
            {
                AdvanceTrainToNextStation(train);
                return;
            }

            var connection = _trackLayoutService.GetRegularConnectionToStation(currentWaypoint.Station, nextWaypoint.Station, out bool isReversed);
            if (connection != null)
            {
                var destinationExitId = isReversed ? connection.FromExitId : connection.ToExitId;
                if (_simulation.IsExitBlocked(nextWaypoint.Station, destinationExitId))
                {
                    sendApprovalEvent.ScheduledTime = _simulation.SimulationTime.AddSeconds(20);
                    return;
                }
            }
            if (connection != null && _openLineTracks.TryGet(connection, out var track) && track.TrainOnTrack != null)
            {
                var blockingTrain = track.TrainOnTrack;
                var retryTime = blockingTrain.TrainEvent?.ScheduledTime.AddSeconds(20) ?? _simulation.SimulationTime.AddSeconds(20);
                sendApprovalEvent.ScheduledTime = retryTime;
                return;
            }

            _ = _notificationManager.SendApprovalRequest(nextWaypoint.Station, currentWaypoint.Station, train.Number);
            sendApprovalEvent.ApprovalSent = true;
            sendApprovalEvent.Processed = true;
        }

        /// <summary>
        /// Called when a train moves from an uncontrolled station to the next station.
        /// Its not being called when a train moves from a player controlled station to the next station.
        /// </summary>
        public void AdvanceTrainToNextStation(Train train)
        {
            var currentWaypoint = train.GetCurrentWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            if (currentWaypoint == null || nextWaypoint == null) throw new Exception($"Train {train.Number} waypoints invalid");

            var layout = _trackLayoutService.GetTrackLayout(currentWaypoint.Station); //layout could be null if the train is at a virtual station at the margin of the map
            var connection = _trackLayoutService.GetRegularConnectionToStation(currentWaypoint.Station, nextWaypoint.Station, out bool isReversed);
            if (connection == null) throw new Exception($"No regular connection found for train {train.Number} from {currentWaypoint.Station} to {nextWaypoint.Station}");
            if (!_openLineTracks.TryGet(connection, out var track))
            {
                throw new Exception($"No open line track found for train {train.Number} from {connection.FromStation} to {connection.ToStation}");
            }

            var distanceToExit = layout != null ? layout.MaxExitDistance / 2 : 0;
            var headingStation = isReversed ? connection.FromStation : connection.ToStation;
            var headingExitId = isReversed ? connection.FromExitId : connection.ToExitId;
            var lineOccupied = track.TrainOnTrack != null && track.TrainOnTrack != train;
            var exitBlocked = _playerManager.IsStationControlled(headingStation)
                && _simulation.IsExitBlocked(headingStation, headingExitId);

            if (lineOccupied || exitBlocked)
            {
                HoldTrainForRetry(train, currentWaypoint, track, track.TrainOnTrack);
                return;
            }

            if (!_openLineTracks.AddTrain(connection, train))
            {
                HoldTrainForRetry(train, currentWaypoint, track, track.TrainOnTrack);
                return;
            }

            var spawn = CreateSpawnFromConnection(train, connection, isReversed, distanceToExit, currentWaypoint.DepartureTime);

            if (_playerManager.IsStationControlled(headingStation))
            {
                _simulation.MarkExitBlocked(headingStation, headingExitId);
                _ = _notificationManager.SendExitBlockStatus(headingStation, headingExitId, true, train.Number, train.Category);
            }

            train.TrainEvent = spawn;
            train.AdvanceToNextWayPoint();
            train.CurrentLocation = null;
            if (track.WaitingTrainNumber == train.Number)
                track.WaitingTrainNumber = null;
            _simulation.RefreshTrainDelay(train, forceNotify: true);
        }

        private void HoldTrainForRetry(Train train, TrainWayPoint currentWaypoint, OpenLineTrack track, Train? blockingTrain)
        {
            if (GetWaitingTrain(track.WaitingTrainNumber) == null)
                track.WaitingTrainNumber = train.Number;

            var retryTime = blockingTrain?.TrainEvent?.ScheduledTime.AddSeconds(20) ?? _simulation.SimulationTime.AddSeconds(20);
            train.TrainEvent = new RetryDispatchEvent(retryTime, blockingTrain?.Number ?? string.Empty);
            train.CurrentLocation = currentWaypoint.Station;
            _simulation.RefreshTrainDelay(train, forceNotify: true);
        }

        /// <summary>
        /// If a train is stored as waiting on this track, dispatch it now.
        /// </summary>
        public void DispatchWaitingTrain(NetworkConnection connection)
        {
            if (!_openLineTracks.TryGet(connection, out var track)) return;
            var waiter = GetWaitingTrain(track.WaitingTrainNumber);
            track.WaitingTrainNumber = null;
            if (waiter == null) return;

            AdvanceTrainToNextStation(waiter);
        }

        private Train? GetWaitingTrain(string? trainNumber)
        {
            if (string.IsNullOrEmpty(trainNumber)) return null;
            var waiter = _simulation.FindTrainByNumber(trainNumber);
            if (waiter == null || waiter.completed || waiter.controlledByPlayer || waiter.updateFailed) return null;
            if (waiter.TrainEvent is not RetryDispatchEvent) return null;
            return waiter;
        }

        public void DispatchTrainByServer(Train train)
        {
            var currentWaypoint = train.GetCurrentWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            if (nextWaypoint == null)
            {
                _simulation.RefreshTrainDelay(train, forceNotify: true);
                train.Record(new TrainCompletedEvent(_simulation.SimulationTime));
                train.completed = true;
                return;
            }
            if (currentWaypoint == null) throw new Exception($"Train {train.Number} has no current way point");

            var requiresApproval = _playerManager.IsStationControlled(nextWaypoint.Station)
                && _trackLayoutService.IsSingleTrackConnection(currentWaypoint.Station, nextWaypoint.Station);
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
