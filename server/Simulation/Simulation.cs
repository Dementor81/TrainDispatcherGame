using System;
using System.Threading;
using System.Threading.Tasks;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Logging;
using TrainDispatcherGame.Server.Services;
using System.Collections.Generic;
using System.Linq;
using TrainDispatcherGame.Server.Models.DTOs;


namespace TrainDispatcherGame.Server.Simulation
{
    public class Simulation
    {
        public const double TimerInterval = 1000;
        private const int MaxTrainUpdateFailures = 3;


        private Timer? _timer;
        private SimulationState _state = SimulationState.Stopped;
        private string? _errorMessage;
        private List<Train> _trains = new();
        private readonly List<MajorEvent> _majorEvents = new();
        private const int MaxMajorEvents = 200;
        private readonly NotificationManager _notificationManager;
        private readonly PlayerManager _playerManager;
        private readonly TrackLayoutService _trackLayoutService;
        private readonly OpenLineTrackRegistry _openLineTracks;
        private readonly TrainEventProcessor _eventProcessor;
        private readonly StationTimetableService _timetableService;
        private readonly HashSet<(string stationId, int exitId)> _blockedExits = new();
        private readonly object _blockedExitsLock = new object();
        private readonly object _simulationLock = new object(); // Thread synchronization object
        private DateTime _simulationStartTime;
        private string _scenarioId;
        private readonly string _sessionId;

        public DateTime SimulationTime => _simulationStartTime.AddSeconds(ElapsedSeconds);
        public double ElapsedSeconds { get; private set; } = 0;
        public SimulationState State => _state;
        public string? ErrorMessage => _errorMessage;
        public List<Train> Trains => _trains;

        public int Speed { get; private set; } = 1;
        public string ScenarioId => _scenarioId;

        internal string SessionId => _sessionId;

        public Simulation(NotificationManager notificationManager, TrackLayoutService trackLayoutService, PlayerManager playerManager, string scenarioId, string sessionId)
        {
            _notificationManager = notificationManager;
            _trackLayoutService = trackLayoutService;
            _playerManager = playerManager;
            _scenarioId = scenarioId;
            _sessionId = sessionId;
            _openLineTracks = new OpenLineTrackRegistry(_trackLayoutService, _sessionId);
            _eventProcessor = new TrainEventProcessor(this, _notificationManager, _playerManager, _trackLayoutService, _openLineTracks);
            _timetableService = new StationTimetableService();
            ServerLogger.Instance.SetSimulationTimeProvider(() => SimulationTime);
            this.Reset();
        }

        private string Ctx(string context)
        {
            return SessionLogContext.Prefix(_sessionId, context);
        }

        private Task NotifySimulationStateChanged()
        {
            return _notificationManager.SendSimulationStateChange(_state, Speed, SimulationTime, ElapsedSeconds);
        }

        internal Train? FindTrainByNumber(string trainNumber)
        {
            return _trains.FirstOrDefault(train => string.Equals(train.Number, trainNumber, StringComparison.OrdinalIgnoreCase));
        }

        private void Reset()
        {
            var scenario = ScenarioService.LoadTrainsFromScenario(_scenarioId);
            // Set active layout before initializing tracks
            if (!string.IsNullOrWhiteSpace(scenario.LayoutId))
            {
                _trackLayoutService.SetActiveLayout(scenario.LayoutId);
            }
            _trains = scenario.Trains;
            ResolveTrainPredecessors();
            _simulationStartTime = scenario.StartTime;
            lock (_blockedExitsLock)
            {
                _blockedExits.Clear();
            }
            _majorEvents.Clear();

            _openLineTracks.Initialize();
            this.CreateInitialStartEvents();
        }

        /// <summary>
        /// Create initial start events for all trains
        /// it creates a TrainStartEvent for each train, with the departure time minus 60 seconds of the first waypoint.
        /// </summary>
        private void ResolveTrainPredecessors()
        {
            try
            {
                foreach (var train in _trains)
                {
                    train.PredecessorTrainNumber = null;
                }

                var trainsByNumber = new Dictionary<string, Train>(StringComparer.OrdinalIgnoreCase);
                var duplicateTrainNumbers = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                foreach (var train in _trains)
                {
                    if (!trainsByNumber.TryAdd(train.Number, train))
                    {
                        duplicateTrainNumbers.Add(train.Number);
                    }
                }

                foreach (var duplicateTrainNumber in duplicateTrainNumbers)
                {
                    trainsByNumber.Remove(duplicateTrainNumber);
                    ServerLogger.Instance.LogWarning(Ctx(duplicateTrainNumber), $"Skipping predecessor resolution for duplicate train number {duplicateTrainNumber}");
                }

                foreach (var train in _trains)
                {
                    if (string.IsNullOrWhiteSpace(train.FollowingTrainNumber))
                    {
                        continue;
                    }

                    if (duplicateTrainNumbers.Contains(train.Number) || duplicateTrainNumbers.Contains(train.FollowingTrainNumber))
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Skipping predecessor resolution from {train.Number} to {train.FollowingTrainNumber} because train numbers are not unique");
                        continue;
                    }

                    if (trainsByNumber.TryGetValue(train.FollowingTrainNumber, out var successor))
                    {
                        successor.PredecessorTrainNumber = train.Number;
                    }
                }
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(_scenarioId ?? string.Empty), $"Error resolving train predecessors: {ex.Message}");
            }
        }

        private void CreateInitialStartEvents()
        {
            try
            {
                foreach (var train in _trains)
                {
                    var firstWayPoint = train.Route.FirstOrDefault();
                    if (firstWayPoint != null)
                    {
                        // subtract 60 seconds to the departure time to give the player time to except the train
                        train.TrainEvent = new TrainStartEvent(firstWayPoint.DepartureTime.AddSeconds(-60), firstWayPoint.Station);
                    }
                    else ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} has no way points");

                }
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(_scenarioId ?? string.Empty), $"Error creating initial start events: {ex.Message}");
            }
        }

        #region Start, Stop, Pause, Resume

        public async Task Start()
        {
            ServerLogger.Instance.LogWarning(Ctx(_scenarioId ?? string.Empty), "Session simulation started.");
            var shouldResume = false;
            lock (_simulationLock)
            {
                if (_state == SimulationState.Running)
                {
                    return;
                }

                if (_state == SimulationState.Paused)
                {
                    shouldResume = true;
                }
                else
                {
                    this.ElapsedSeconds = 0;
                    _state = SimulationState.Running;
                    _errorMessage = null;
                    _timer = new Timer(UpdateSimulation, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(TimerInterval));
                }
            }

            if (shouldResume)
            {
                await Resume();
                return;
            }

            try
            {
                ServerLogger.Instance.LogDebug(Ctx(_scenarioId ?? string.Empty), $"Simulation started at {_simulationStartTime:HH:mm:ss}");
                await NotifySimulationStateChanged();
            }
            catch (Exception ex)
            {
                lock (_simulationLock)
                {
                    _state = SimulationState.Error;
                    _errorMessage = ex.Message;
                }
                ServerLogger.Instance.LogError(Ctx(_scenarioId ?? string.Empty), $"Error starting simulation: {ex.Message}");
                try
                {
                    await NotifySimulationStateChanged();
                }
                catch (Exception notifyEx)
                {
                    ServerLogger.Instance.LogError(Ctx(_scenarioId ?? string.Empty), $"Error notifying start failure: {notifyEx.Message}");
                }
            }
        }

        public async Task Stop()
        {
            lock (_simulationLock)
            {
                if (_state == SimulationState.Stopped)
                {
                    return;
                }

                _timer?.Dispose();
                _timer = null;
                _state = SimulationState.Stopped;
                _errorMessage = null;

                _trains.Clear();
                this.Reset();
            }

            ServerLogger.Instance.LogDebug(Ctx(_scenarioId ?? string.Empty), "Simulation stopped");

            try
            {
                await NotifySimulationStateChanged();
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(_scenarioId ?? string.Empty), $"Error notifying simulation stop: {ex.Message}");
            }
        }

        public async Task Pause()
        {
            lock (_simulationLock)
            {
                if (_state != SimulationState.Running)
                {
                    return;
                }

                _timer?.Dispose();
                _timer = null;
                _state = SimulationState.Paused;
            }

            ServerLogger.Instance.LogDebug(Ctx(_scenarioId ?? string.Empty), $"Simulation paused at {SimulationTime:HH:mm:ss}");

            try
            {
                await NotifySimulationStateChanged();
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(_scenarioId ?? string.Empty), $"Error notifying simulation pause: {ex.Message}");
            }
        }

        public async Task Resume()
        {
            try
            {
                lock (_simulationLock)
                {
                    if (_state != SimulationState.Paused)
                    {
                        return;
                    }

                    _state = SimulationState.Running;
                    _errorMessage = null;
                    _timer = new Timer(UpdateSimulation, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(TimerInterval));
                }

                ServerLogger.Instance.LogDebug(Ctx(_scenarioId ?? string.Empty), $"Simulation resumed at {SimulationTime:HH:mm:ss}");
                await NotifySimulationStateChanged();
            }
            catch (Exception ex)
            {
                lock (_simulationLock)
                {
                    _state = SimulationState.Error;
                    _errorMessage = ex.Message;
                }
                ServerLogger.Instance.LogError(Ctx(_scenarioId ?? string.Empty), $"Error resuming simulation: {ex.Message}");
            }
        }
        #endregion

        private void UpdateSimulation(object? state)
        {
            lock (_simulationLock)
            {
                if (_state == SimulationState.Running)
                {
                    try
                    {
                        this.ElapsedSeconds += (TimerInterval / 1000) * this.Speed;
                        CheckTrainEvents();
                    }
                    catch (Exception ex)
                    {
                        // Keep simulation running even if a single tick encounters an unexpected error.
                        ServerLogger.Instance.LogError(Ctx(_scenarioId ?? string.Empty), $"Error in simulation update tick: {ex.Message}");
                    }
                }
            }
        }

        private void CheckTrainEvents()
        {
            foreach (var train in _trains)
            {
                if (train.updateFailed) continue;

                if (!train.completed && !train.controlledByPlayer)
                {
                    try
                    {
                        _eventProcessor.HandleTrainEvent(train);
                        train.updateFailCount = 0;
                    }
                    catch (Exception ex)
                    {
                        train.updateFailCount++;
                        ServerLogger.Instance.LogError(Ctx(train.Number), $"Train update error ({train.updateFailCount}/{MaxTrainUpdateFailures}): {ex.Message}");
                        if (train.updateFailCount >= MaxTrainUpdateFailures)
                        {
                            RetireTrain(train);
                        }
                    }
                }

                RefreshTrainDelay(train);
            }
        }

        internal void RefreshTrainDelay(Train train, bool forceNotify = false)
        {
            if (train.completed || train.updateFailed)
                return;

            var computed = train.ComputeCurrentDelay(SimulationTime);
            if (computed == train.delay)
                return;

            var minuteChanged = computed / 60 != train.delay / 60;
            train.delay = computed;
            if (forceNotify || minuteChanged)
                NotifyTrainDelayUpdated(train);
        }

        internal void RetireTrain(Train train)
        {
            try
            {
                RefreshTrainDelay(train);
                train.damaged = true;
                train.completed = true;
                train.controlledByPlayer = false;
                train.updateFailed = true;
                train.TrainEvent = null;
                ReleaseTrainOccupancy(train);
                RecordMajorEvent(MajorEventType.Failed, train.Number, station: train.CurrentLocation);
                NotifyTrainRemoved(train);
                ServerLogger.Instance.LogError(Ctx(train.Number), $"Train {train.Number} retired after repeated update failures");
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(train.Number), $"Error retiring train {train.Number}: {ex.Message}");
            }
        }

        private void ReleaseTrainOccupancy(Train train)
        {
            foreach (var connection in _openLineTracks.ReleaseTrain(train))
            {
                try
                {
                    _eventProcessor.DispatchWaitingTrain(connection);
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(train.Number), $"Error dispatching waiting train after releasing {train.Number}: {ex.Message}");
                }
            }
        }

        public Task TrainReturnedFromClient(Train train, int exitId)
        {
            lock (_simulationLock)
            {
                try
                {
                    if (train.CurrentLocation == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} has no current location");
                        return Task.CompletedTask;
                    }

                    var connection = _trackLayoutService.GetConnection(train.CurrentLocation, exitId, out bool isReversed);
                    if (connection == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"No connection found for train {train.Number} at {train.CurrentLocation} at Exit {exitId}");
                        return Task.CompletedTask;
                    }

                    var currentWayPoint = train.GetCurrentWayPoint();
                    if (currentWayPoint == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} has no current event");
                        return Task.CompletedTask;
                    }

                    train.Record(new TrainReturnedFromPlayerEvent(SimulationTime, train.CurrentLocation, exitId));
                    train.controlledByPlayer = false;
                    train.CurrentLocation = null;

                    if (currentWayPoint.Stops && !currentWayPoint.Processed)
                    {
                        train.Record(new TrainMissedStopEvent(SimulationTime, currentWayPoint.Station));
                        RecordMajorEvent(MajorEventType.MissedStop, train.Number, station: currentWayPoint.Station);
                    }

                    if (train.GetNextWayPoint() == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"This should not happend, probably a bug in train scheduling, Train {train.Number} has completed all events after it returned from a station");
                        RefreshTrainDelay(train, forceNotify: true);
                        train.Record(new TrainCompletedEvent(SimulationTime));
                        train.completed = true;
                        return Task.CompletedTask;
                    }

                    var nextWaypoint = train.AdvanceToNextWayPoint()!;

                    if (nextWaypoint.Station != connection.ToStation && !isReversed || nextWaypoint.Station != connection.FromStation && isReversed)
                    {
                        var actualStation = isReversed ? connection.FromStation : connection.ToStation;
                        train.Record(new TrainMissroutedEvent(SimulationTime, nextWaypoint.Station, actualStation));
                    }

                    var arrivalTime = SimulationTime.AddSeconds(train.GetTravelTime(connection.Distance));
                    var nextSpawn = new TrainSpawnEvent(arrivalTime, connection, isReversed);
                    train.TrainEvent = nextSpawn;
                    string? occupyingTrainNumber = null;
                    if (_openLineTracks.TryGet(connection, out var occupiedTrack))
                    {
                        occupyingTrainNumber = occupiedTrack.TrainOnTrack?.Number;
                    }
                    if (!_openLineTracks.AddTrain(connection, train))
                    {
                        ServerLogger.Instance.LogEmergency(Ctx(train.Number), $"Train {train.Number} collision detected on track from {connection.FromStation} to {connection.ToStation}");
                        RefreshTrainDelay(train);
                        train.completed = true;
                        train.damaged = true;
                        RecordMajorEvent(MajorEventType.Collision, train.Number, occupyingTrainNumber, connection.FromStation);
                    }

                    RefreshTrainDelay(train, forceNotify: true);
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(train.Number), $"Error returning train from client: {ex.Message}");
                }
            }
            return Task.CompletedTask;
        }

        /// <summary>
        /// When a player disconnects from a station, return trains at the station to server control
        /// and remove any trains on open line tracks heading to/from this station.
        /// </summary>
        public Task ReturnTrainsAtStation(string stationId)
        {
            lock (_simulationLock)
            {
                try
                {
                    var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;

                    var trainsToReturn = _trains
                        .Where(t => t.controlledByPlayer && string.Equals(t.CurrentLocation, normalizedStationId, StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    ServerLogger.Instance.LogDebug(Ctx(normalizedStationId), $"Returning {trainsToReturn.Count} trains at station {stationId}");

                    foreach (var train in trainsToReturn)
                    {
                        try
                        {
                            train.Record(new TrainReturnedFromPlayerEvent(SimulationTime, normalizedStationId));
                            train.controlledByPlayer = false;
                            train.CurrentLocation = null;
                            ReleaseTrainOccupancy(train);
                            _eventProcessor.DispatchTrainByServer(train);
                        }
                        catch (Exception ex)
                        {
                            ServerLogger.Instance.LogError(Ctx(train.Number), $"Error returning train {train.Number} at station {stationId}: {ex.Message}");
                            RetireTrain(train);
                        }
                    }
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(stationId ?? string.Empty), $"Error returning trains at station {stationId} on disconnect: {ex.Message}");
                }
            }
            return Task.CompletedTask;
        }

        public void ReceiveApproval(string trainNumber, string fromStationId, bool approved)
        {
            lock (_simulationLock)
            {
                try
                {
                    var train = _trains.FirstOrDefault(t => t.Number == trainNumber);
                    if (train == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(trainNumber), $"Approval for unknown train {trainNumber}");
                        return;
                    }
                    if (train.TrainEvent is not SendApprovalEvent)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Approval for train {train.Number} ignored because next event is {train.TrainEvent?.GetType().Name ?? "none"}");
                        return;
                    }

                    if (!approved)
                    {
                        train.TrainEvent = new SendApprovalEvent(SimulationTime.AddMinutes(1));
                        return;
                    }

                    _eventProcessor.AdvanceTrainToNextStation(train);
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(trainNumber), $"Error processing approval: {ex.Message}");
                }
            }
        }

        public void ReportTrainStopped(Train train, string stationId)
        {
            lock (_simulationLock)
            {
                try
                {
                    var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
                    var currentWaypoint = train.GetCurrentWayPoint();
                    if (currentWaypoint == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} has no current event to mark as stopped");
                        return;
                    }

                    if (currentWaypoint.Station != normalizedStationId)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} reported stopped at {normalizedStationId} but current event is for station {currentWaypoint.Station}");
                        return;
                    }

                    if (currentWaypoint.Processed)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} station event at {normalizedStationId} is already processed");
                        return;
                    }

                    currentWaypoint.Processed = true;
                    currentWaypoint.ActualArrivalTime = SimulationTime;
                    RefreshTrainDelay(train, forceNotify: true);
                    train.Record(new TrainStoppedEvent(SimulationTime, normalizedStationId, train.delay));
                    if (currentWaypoint.IsLast)
                    {
                        train.Record(new TrainCompletedEvent(SimulationTime));
                        train.completed = true;
                        ReleaseTrainOccupancy(train);
                        NotifyTrainRemoved(train);
                        return;
                    }
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(train.Number), $"Error reporting train stopped: {ex.Message}");
                }
            }
        }

        public bool ReportTrainDeparted(Train train, string stationId)
        {
            lock (_simulationLock)
            {
                try
                {
                    var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
                    var currentEvent = train.GetCurrentWayPoint();
                    if (currentEvent == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} has no current event to mark as departed");
                        return false;
                    }

                    if (currentEvent.Station != normalizedStationId)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} reported departed from {normalizedStationId} but current event is for station {currentEvent.Station}");
                        return false;
                    }

                    if (!currentEvent.Processed)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(train.Number), $"Train {train.Number} station event at {normalizedStationId} is not yet processed (must stop before departing)");
                        return false;
                    }

                    currentEvent.ActualDepartureTime = SimulationTime;
                    RefreshTrainDelay(train, forceNotify: true);
                    train.Record(new TrainDepartedEvent(SimulationTime, normalizedStationId, train.delay));
                    return true;
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(train.Number), $"Error reporting train departed: {ex.Message}");
                    return false;
                }
            }
        }

        public void HandleCollision(Train trainA, Train trainB, string? stationId = null)
        {
            lock (_simulationLock)
            {
                try
                {
                    ServerLogger.Instance.LogEmergency(Ctx(trainA.Number), $"Collision: trains {trainA.Number} and {trainB.Number} by client report");
                    RefreshTrainDelay(trainA);
                    RefreshTrainDelay(trainB);
                    trainA.damaged = true;
                    trainB.damaged = true;
                    trainA.completed = true;
                    trainB.completed = true;
                    trainA.controlledByPlayer = false;
                    trainB.controlledByPlayer = false;
                    ReleaseTrainOccupancy(trainA);
                    if (trainB != trainA)
                    {
                        ReleaseTrainOccupancy(trainB);
                    }
                    RecordMajorEvent(MajorEventType.Collision, trainA.Number, trainB.Number, stationId);
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(trainA.Number), $"Error handling collision: {ex.Message}");
                }
            }
        }

        public void HandleDerailment(Train train, string stationId, int? switchId)
        {
            lock (_simulationLock)
            {
                try
                {
                    var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
                    RefreshTrainDelay(train);
                    train.damaged = true;
                    train.completed = true;
                    train.controlledByPlayer = false;
                    ReleaseTrainOccupancy(train);
                    var switchInfo = switchId.HasValue ? $" at switch {switchId.Value}" : string.Empty;
                    ServerLogger.Instance.LogEmergency(Ctx(train.Number), $"Derailment: train {train.Number} removed by client report at station {normalizedStationId}{switchInfo}");
                    RecordMajorEvent(MajorEventType.Derailed, train.Number, station: normalizedStationId);
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(train.Number), $"Error handling derailment: {ex.Message}");
                }
            }
        }

        public void HandleTrainRemoved(Train train, string? stationId = null)
        {
            lock (_simulationLock)
            {
                try
                {
                    var station = !string.IsNullOrWhiteSpace(stationId) ? stationId : train.CurrentLocation;
                    train.controlledByPlayer = false;
                    ReleaseTrainOccupancy(train);
                    if (train.completed || train.damaged)
                    {
                        NotifyTrainRemoved(train);
                        return;
                    }

                    RefreshTrainDelay(train);
                    train.completed = true;
                    train.removed = true;
                    RecordMajorEvent(MajorEventType.Removed, train.Number, station: station);
                    NotifyTrainRemoved(train);
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(train.Number), $"Error handling train removed: {ex.Message}");
                }
            }
        }

        public List<MajorEvent> GetMajorEventsNewestFirst()
        {
            var copy = new List<MajorEvent>(_majorEvents);
            copy.Reverse();
            return copy;
        }

        private void RecordMajorEvent(MajorEventType type, string trainNumber, string? otherTrainNumber = null, string? station = null)
        {
            var evt = new MajorEvent
            {
                SimulationTime = SimulationTime,
                Type = type,
                TrainNumber = trainNumber,
                OtherTrainNumber = otherTrainNumber,
                Station = station,
                PlayerName = ResolvePlayerName(station)
            };
            _majorEvents.Add(evt);
            if (_majorEvents.Count > MaxMajorEvents)
            {
                _majorEvents.RemoveAt(0);
            }
            _ = _notificationManager.SendMajorEventOccurred(evt);
        }

        private string? ResolvePlayerName(string? station)
        {
            if (string.IsNullOrWhiteSpace(station)) return null;
            var player = _playerManager.GetPlayerByStation(station);
            if (player == null) return null;
            return string.IsNullOrWhiteSpace(player.Name) ? player.Id : player.Name;
        }

        internal void NotifyTrainDelayUpdated(Train train)
        {
            var payload = new TrainDelayUpdatedNotification
            {
                TrainNumber = train.Number,
                CurrentDelay = train.delay
            };

            _ = _notificationManager.SendTrainDelayUpdated(payload);
        }

        public void NotifyTrainRemoved(Train train)
        {
            var payload = new TrainRemovedNotification
            {
                TrainNumber = train.Number
            };

            _ = _notificationManager.SendTrainRemoved(payload);
        }

        public List<StationTimetableEvent> GetStationTimetableEvents(string stationId)
        {
            return _timetableService.BuildStationTimetableEvents(_trains, stationId, SimulationTime);
        }

        // Manually advance simulation time by a number of seconds and process due events
        public async Task AdvanceSeconds(double seconds)
        {
            if (seconds <= 0)
            {
                return;
            }

            lock (_simulationLock)
            {
                this.ElapsedSeconds += seconds;
                CheckTrainEvents();
            }

            await NotifySimulationStateChanged();
        }

        public void SetSpeed(int speed)
        {
            lock (_simulationLock)
            {
                if (speed < 1) speed = 1;
                if (speed > 100) speed = 100;
                this.Speed = speed;
            }
            _ = NotifySimulationStateChanged();
        }

        public List<TrainDispatcherGame.Server.Models.DTOs.OpenLineTrackStatusDto> GetOpenLineTrackStatuses()
        {
            lock (_simulationLock)
            {
                var result = new List<TrainDispatcherGame.Server.Models.DTOs.OpenLineTrackStatusDto>();
                foreach (var t in _openLineTracks.GetAll())
                {
                    var dto = new TrainDispatcherGame.Server.Models.DTOs.OpenLineTrackStatusDto
                    {
                        From = t.Connection.FromStation,
                        FromExitId = t.Connection.FromExitId,
                        To = t.Connection.ToStation,
                        ToExitId = t.Connection.ToExitId,
                        Distance = t.Connection.Distance,
                        Mode = t.Connection.Mode.ToString(),
                        TrainNumber = t.TrainOnTrack != null ? t.TrainOnTrack.Number : null
                    };
                    result.Add(dto);
                }
                return result;
            }
        }

        public bool IsExitBlocked(string stationId, int exitId)
        {
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            lock (_blockedExitsLock)
            {
                return _blockedExits.Contains((normalizedStationId, exitId));
            }
        }

        /// <summary>
        /// Records that a destination exit is owned by a train the server just put on the open line.
        /// </summary>
        public void MarkExitBlocked(string stationId, int exitId)
        {
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            lock (_blockedExitsLock)
            {
                _blockedExits.Add((normalizedStationId, exitId));
            }
        }

        public void ClearExitBlocked(string stationId, int exitId)
        {
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            lock (_blockedExitsLock)
            {
                _blockedExits.Remove((normalizedStationId, exitId));
            }
        }

        /// <summary>
        /// Handles the report of a station exit being blocked or unblocked by a train route.
        /// It will notify the neighboring station so it can extend the train route to the other station.
        /// </summary>
        /// <param name="playerId">The player id.</param>
        /// <param name="exitId">The exit id of the station that is being blocked or unblocked.</param>
        /// <param name="blocked">True if the exit is blocked, false if it is unblocked.</param>
        public async Task HandleExitBlockStatus(string playerId, int exitId, bool blocked)
        {
            string? otherStation = null;
            var otherExitId = 0;
            var notifyBlocked = blocked;

            lock (_simulationLock)
            {
                try
                {
                    var player = _playerManager.GetPlayer(playerId);
                    if (player == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(playerId), $"Player {playerId} not found");
                        return;
                    }

                    var stationId = player.StationId;
                    var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;

                    var connection = _trackLayoutService.GetConnection(normalizedStationId, exitId, out bool isReversed);
                    if (connection == null)
                    {
                        ServerLogger.Instance.LogWarning(Ctx(normalizedStationId), $"No connection found for exit {exitId} at station {stationId}");
                        return;
                    }

                    if (!blocked)
                    {
                        ClearExitBlocked(normalizedStationId, exitId);

                        if (_openLineTracks.TryGet(connection, out var openLine)
                            && openLine.TrainOnTrack != null
                            && openLine.TrainOnTrack.controlledByPlayer)
                        {
                            _openLineTracks.RemoveTrain(connection);
                        }

                        _eventProcessor.DispatchWaitingTrain(connection);
                    }
                    else
                    {
                        MarkExitBlocked(normalizedStationId, exitId);
                    }

                    if (isReversed)
                    {
                        otherStation = connection.FromStation;
                        otherExitId = connection.FromExitId;
                    }
                    else
                    {
                        otherStation = connection.ToStation;
                        otherExitId = connection.ToExitId;
                    }
                }
                catch (Exception ex)
                {
                    ServerLogger.Instance.LogError(Ctx(playerId), $"Error handling exit block status: {ex.Message}");
                    return;
                }
            }

            if (otherStation == null)
            {
                return;
            }

            try
            {
                await _notificationManager.SendExitBlockStatus(otherStation, otherExitId, notifyBlocked);
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(playerId), $"Error notifying exit block status: {ex.Message}");
            }
        }
    }
}