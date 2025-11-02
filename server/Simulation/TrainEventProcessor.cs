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
        private readonly OpenLineTrackRegistry _trackRegistry;

        public TrainEventProcessor(NotificationManager notificationManager,
                                   PlayerManager playerManager,
                                   TrackLayoutService trackLayoutService,
                                   OpenLineTrackRegistry trackRegistry)
        {
            _notificationManager = notificationManager;
            _playerManager = playerManager;
            _trackLayoutService = trackLayoutService;
            _trackRegistry = trackRegistry;
        }

        public DateTime SimulationTime { get; set; }

        public TrainSpawnEvent CreateSpawnFromConnection(Train train, NetworkConnection connection, bool isReversed, int additionalDistance, DateTime scheduledTime = default)
        {
            var distance = connection.Distance + additionalDistance;
            var seconds = train.GetTravelTime(distance);
            return new TrainSpawnEvent(
                scheduledTime == default ? SimulationTime.AddSeconds(seconds) : scheduledTime.AddSeconds(seconds),
                connection,
                isReversed
            );
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
            if (train.TrainEvent is not TrainSpawnEvent spawn)
            {
                throw new Exception($"Train {train.Number} next event is not a spawn event");
            }

            // Remove from line if present
            _trackRegistry.RemoveTrain(spawn.Connection, train);

            var station = spawn.HeadingStation;
            var exitPointId = spawn.HeadingExitId;

            if (_playerManager.IsStationControlled(station))
            {
                if (exitPointId == -1) throw new Exception($"Train {train.Number} has invalid exit point id -1 for player controlled station");
                await _notificationManager.SendTrain(station, train, exitPointId);
                train.controlledByPlayer = true;
                // Normalize station ID to lowercase for consistent handling
                train.CurrentLocation = station?.ToLowerInvariant() ?? string.Empty;
                train.TrainEvent = null;
                return;
            }

            await DispatchTrainByServer(train);
        }

        public async Task HandleSendApproval(Train train)
        {
            var sendApprovalEvent = train.TrainEvent as SendApprovalEvent;
            if (sendApprovalEvent == null) throw new Exception($"Train {train.Number} next event is not a send approval event");
            if (sendApprovalEvent.ApprovalSent) return;

            var currentWaypoint = train.GetCurrentWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            if (currentWaypoint == null || nextWaypoint == null) throw new Exception($"Train {train.Number} cannot request approval without valid waypoints");

            await _notificationManager.SendApprovalRequest(nextWaypoint.Station, currentWaypoint.Station, train.Number);
            sendApprovalEvent.ApprovalSent = true;
        }

        public async Task HandleTrainStart(Train train)
        {
            await DispatchTrainByServer(train);
        }

        public void AdvanceTrainToNextStation(Train train)
        {
            var currentWaypoint = train.GetCurrentWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            if (currentWaypoint == null || nextWaypoint == null) throw new Exception($"Train {train.Number} waypoints invalid");

            var departureTime = currentWaypoint.DepartureTime > SimulationTime ? currentWaypoint.DepartureTime : SimulationTime;
            if (departureTime > SimulationTime)
            {
                train.delay = (int)(departureTime - SimulationTime).TotalSeconds;
            }

            var layout = _trackLayoutService.GetTrackLayout(currentWaypoint.Station);
            bool isReversed;
            var connection = _trackLayoutService.GetRegularConnectionToStation(currentWaypoint.Station, nextWaypoint.Station, out isReversed);
            var distanceToExit = 0;
            if (connection == null) throw new Exception($"No regular connection found for train {train.Number} from {currentWaypoint.Station} to {nextWaypoint.Station}");
            if (layout != null) distanceToExit = layout.MaxExitDistance / 2;

            var spawn = CreateSpawnFromConnection(train, connection, isReversed, distanceToExit, departureTime);
            train.TrainEvent = spawn;
            train.AdvanceToNextWayPoint();
            _trackRegistry.AddTrain(connection, train);
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


