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


        private Timer? _timer;
        private SimulationState _state = SimulationState.Stopped;
        private string? _errorMessage;
        private List<Train> _trains = new();
        private readonly NotificationManager _notificationManager;
        private readonly PlayerManager _playerManager;
        private readonly TrackLayoutService _trackLayoutService;
        private readonly OpenLineTrackRegistry _openLineTracks;
        private readonly TrainEventProcessor _eventProcessor;
        private readonly StationTimetableService _timetableService;
        private readonly object _simulationLock = new object(); // Thread synchronization object
        private DateTime _simulationStartTime;
        private string _scenarioId;

        public DateTime SimulationTime => _simulationStartTime.AddSeconds(ElapsedSeconds);
        public double ElapsedSeconds { get; private set; } = 0;
        public SimulationState State => _state;
        public string? ErrorMessage => _errorMessage;
        public List<Train> Trains => _trains;

        public int Speed { get; private set; } = 1;
        public string ScenarioId => _scenarioId;

        public Simulation(NotificationManager notificationManager, TrackLayoutService trackLayoutService, PlayerManager playerManager, string scenarioId)
        {
            _notificationManager = notificationManager;
            _trackLayoutService = trackLayoutService;
            _playerManager = playerManager;
            _scenarioId = scenarioId;
            _openLineTracks = new OpenLineTrackRegistry(_trackLayoutService);
            _eventProcessor = new TrainEventProcessor(_notificationManager, _playerManager, _trackLayoutService, _openLineTracks);
            _timetableService = new StationTimetableService();
            ServerLogger.Instance.SetSimulationTimeProvider(() => SimulationTime);
            this.Reset();
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
            _simulationStartTime = scenario.StartTime;

            _openLineTracks.Initialize();
            this.CreateInitialStartEvents();
        }

        public async Task SetScenario(string scenarioId)
        {
            if (string.IsNullOrWhiteSpace(scenarioId))
            {
                throw new ArgumentException("Scenario id must not be empty", nameof(scenarioId));
            }

            // Validate before switching
            var exists = ScenarioService.GetScenarioById(scenarioId) != null;
            if (!exists)
            {
                throw new Exception($"Scenario '{scenarioId}' not found");
            }

            _scenarioId = scenarioId;

            // Stop will also Reset to the new scenario and broadcast state
            this.Stop();
            this.Reset();

            // If previously paused, Stop() will set state to Stopped and reset.
            // Ensure clients receive current state
            await _notificationManager.SendSimulationStateChange(this._state, this.Speed);

            ServerLogger.Instance.LogDebug(scenarioId, $"Scenario set to {scenarioId}");
        }


        /// <summary>
        /// Create initial start events for all trains
        /// it creates a TrainStartEvent for each train, with the departure time minus 60 seconds of the first waypoint.
        /// </summary>
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
                    else ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} has no way points");

                }
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(_scenarioId ?? string.Empty, $"Error creating initial start events: {ex.Message}");
            }
        }

        #region Start, Stop, Pause, Resume

        public async void Start()
        {
            ServerLogger.Instance.LogWarning(_scenarioId ?? string.Empty, $"Test warning message");
            ServerLogger.Instance.LogError(_scenarioId ?? string.Empty, $"Test error message");
            ServerLogger.Instance.LogDebug(_scenarioId ?? string.Empty, $"Test debug message"); 
            if (_state == SimulationState.Running)
            {
                return; // Already running
            }

            if (_state == SimulationState.Paused)
            {
                // Resume from pause
                await Resume();
                return;
            }

            try
            {
                this.ElapsedSeconds = 0;
                _state = SimulationState.Running;
                _errorMessage = null;

                _timer = new Timer(UpdateSimulation, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(TimerInterval));

                ServerLogger.Instance.LogDebug(_scenarioId ?? string.Empty, $"Simulation started at {_simulationStartTime:HH:mm:ss}");

                // Notify all clients about the state change
                await _notificationManager.SendSimulationStateChange(_state, this.Speed);
            }
            catch (Exception ex)
            {
                _state = SimulationState.Error;
                _errorMessage = ex.Message;
                ServerLogger.Instance.LogError(_scenarioId ?? string.Empty, $"Error starting simulation: {ex.Message}");
                await _notificationManager.SendSimulationStateChange(_state, this.Speed);
            }
        }

        public async void Stop()
        {
            if (_state == SimulationState.Stopped)
            {
                return; // Already stopped
            }

            _timer?.Dispose();
            _timer = null;
            _state = SimulationState.Stopped;
            _errorMessage = null;

            _trains.Clear();
            this.Reset();

            ServerLogger.Instance.LogDebug(_scenarioId ?? string.Empty, "Simulation stopped");

            // Notify all clients about the state change
            await _notificationManager.SendSimulationStateChange(_state, this.Speed);
        }

        public async void Pause()
        {
            if (_state != SimulationState.Running)
            {
                return; // Not running
            }

            _timer?.Dispose();
            _timer = null;
            _state = SimulationState.Paused;

            ServerLogger.Instance.LogDebug(_scenarioId ?? string.Empty, $"Simulation paused at {SimulationTime:HH:mm:ss}");

            // Notify all clients about the state change
            await _notificationManager.SendSimulationStateChange(_state, this.Speed);
        }

        public async Task Resume()
        {
            if (_state != SimulationState.Paused)
            {
                return; // Not paused
            }

            try
            {
                _state = SimulationState.Running;
                _errorMessage = null;
                _timer = new Timer(UpdateSimulation, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(TimerInterval));

                ServerLogger.Instance.LogDebug(_scenarioId ?? string.Empty, $"Simulation resumed at {SimulationTime:HH:mm:ss}");

                // Notify all clients about the state change
                await _notificationManager.SendSimulationStateChange(_state, this.Speed);
            }
            catch (Exception ex)
            {
                _state = SimulationState.Error;
                _errorMessage = ex.Message;
                ServerLogger.Instance.LogError(_scenarioId ?? string.Empty, $"Error resuming simulation: {ex.Message}");
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
                        _eventProcessor.SimulationTime = this.SimulationTime;
                        CheckTrainEvents();
                    }
                    catch (Exception ex)
                    {
                        _state = SimulationState.Error;
                        _errorMessage = ex.Message;
                        ServerLogger.Instance.LogError(_scenarioId ?? string.Empty, $"Error in simulation update: {ex.Message}");
                    }
                }
            }
        }

        private void CheckTrainEvents()
        {
            foreach (var train in _trains)
            {
                if (train.completed || train.controlledByPlayer) continue;

                _eventProcessor.HandleTrainEvent(train).GetAwaiter().GetResult();
            }
        }           

        public Task TrainReturnedFromClient(Train train, int exitId)
        {
            try
            {
                ServerLogger.Instance.LogDebug(train.Number, $"Train {train.Number} returned from client at {train.CurrentLocation} at Exit {exitId}");
                if (train.CurrentLocation == null) throw new Exception($"Train {train.Number} has no current location");

                var connection = _trackLayoutService.GetConnection(train.CurrentLocation, exitId, out bool isReversed);
                if (connection == null) throw new Exception($"No connection found for train {train.Number} at {train.CurrentLocation} at Exit {exitId}");


                train.controlledByPlayer = false;
                train.CurrentLocation = null;

                var currentWayPoint = train.GetCurrentWayPoint();
                if (currentWayPoint == null) throw new Exception($"Train {train.Number} has no current event");

                //calculate the expected time at the exit to check if the train is late
                var layout = _trackLayoutService.GetTrackLayout(currentWayPoint.Station);
                if (layout == null) throw new Exception($"No layout found for station {currentWayPoint.Station}");
                var expectedTimeAtExit = currentWayPoint.DepartureTime.AddSeconds(train.GetTravelTime(layout.MaxExitDistance / 2));                
                train.delay = (int)Math.Max(0, (SimulationTime - expectedTimeAtExit).TotalSeconds); 
                

                if (currentWayPoint.Stops && !currentWayPoint.Processed)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} missed stop at {currentWayPoint.Station}!");
                }

                var nextWaypoint = train.AdvanceToNextWayPoint();
                if (nextWaypoint == null)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"This should not happend, probably a bug in train scheduling, Train {train.Number} has completed all events after it returned from a station");
                    train.completed = true;
                    return Task.CompletedTask;
                }

                if (nextWaypoint.Station != connection.ToStation && !isReversed || nextWaypoint.Station != connection.FromStation && isReversed)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} was missrouted to {connection.ToStation} instead of {nextWaypoint.Station} or vice versa");
                    // TODO: handle missrouted train
                }

                if (nextWaypoint.IsLast)
                {
                    ServerLogger.Instance.LogDebug(train.Number, $"Train {train.Number} has completed all events");
                    train.completed = true;
                }
                else
                {
                    var nextSpawn = _eventProcessor.CreateSpawnFromConnection(train, connection, isReversed, 0, currentWayPoint.DepartureTime);
                    train.TrainEvent = nextSpawn;
                    if (!_openLineTracks.AddTrain(connection, train))
                    {
                        ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} collision detected on track from {connection.FromStation} to {connection.ToStation}");
                        train.completed = true;
                    }
                }

            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(train.Number, $"Error returning train from client: {ex.Message}");
                throw;
            }
            return Task.CompletedTask;
        }

        

        /// <summary>
        /// When a player disconnects from a station, return trains at the station to server control
        /// and remove any trains on open line tracks heading to/from this station.
        /// </summary>
        /// <param name="stationId">The station the player controlled.</param>
        public async Task ReturnTrainsAtStation(string stationId)
        {
            try
            {
                var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
                
                // Return trains currently at the station to server control
                var trainsToReturn = _trains
                    .Where(t => t.controlledByPlayer && string.Equals(t.CurrentLocation, normalizedStationId, StringComparison.OrdinalIgnoreCase))
                    .ToList();

                foreach (var train in trainsToReturn)
                {
                    train.controlledByPlayer = false;
                    train.CurrentLocation = null;
                    _openLineTracks.RemoveTrainFromAllTracks(train);
                    await _eventProcessor.DispatchTrainByServer(train);
                }

            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(stationId ?? string.Empty, $"Error returning trains at station {stationId} on disconnect: {ex.Message}");
            }
        }

        public void ReceiveApproval(string trainNumber, string fromStationId, bool approved)
        {
            try
            {
                var train = _trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    ServerLogger.Instance.LogWarning(trainNumber, $"Approval for unknown train {trainNumber}");
                    return;
                }
                var sendApprovalEvent = train.TrainEvent as SendApprovalEvent;
                if (sendApprovalEvent == null) throw new Exception($"Train {train.Number} next event is not a send approval event");

                if (!approved)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Approval denied for train {train.Number}");
                    sendApprovalEvent.ApprovalDenied(SimulationTime.AddSeconds(60));
                    return;
                }

                ServerLogger.Instance.LogDebug(train.Number, $"Approval received for train {train.Number} from {fromStationId}");
                _eventProcessor.AdvanceTrainToNextStation(train);
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(trainNumber, $"Error processing approval: {ex.Message}");
            }
        }

        public void ReportTrainStopped(Train train, string stationId)
        {
            try
            {
                var currentWaypoint = train.GetCurrentWayPoint();
                if (currentWaypoint == null)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} has no current event to mark as stopped");
                    return;
                }

                if (currentWaypoint.Station != stationId)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} reported stopped at {stationId} but current event is for station {currentWaypoint.Station}");
                    return;
                }

                if (currentWaypoint.Processed)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} station event at {stationId} is already processed");
                    return;
                }

                // Mark the current station event as processed
                currentWaypoint.Processed = true;
                train.delay = (int)(SimulationTime - currentWaypoint.ArrivalTime).TotalSeconds;
                ServerLogger.Instance.LogDebug(train.Number, $"Train {train.Number} successfully stopped at station {stationId} with delay {train.delay} seconds");
                if (currentWaypoint.IsLast)
                {
                    ServerLogger.Instance.LogDebug(train.Number, $"Train {train.Number} has completed all events");
                    train.completed = true;
                }
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(train.Number, $"Error reporting train stopped: {ex.Message}");                
            }
        }

        public bool ReportTrainDeparted(Train train, string stationId)
        {
            try
            {
                var currentEvent = train.GetCurrentWayPoint();
                if (currentEvent == null)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} has no current event to mark as departed");
                    return false;
                }

                if (currentEvent.Station != stationId)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} reported departed from {stationId} but current event is for station {currentEvent.Station}");
                    return false;
                }

                if (!currentEvent.Processed)
                {
                    ServerLogger.Instance.LogWarning(train.Number, $"Train {train.Number} station event at {stationId} is not yet processed (must stop before departing)");
                    return false;
                }


                train.delay = (int)(SimulationTime - currentEvent.DepartureTime).TotalSeconds;

                ServerLogger.Instance.LogDebug(train.Number, $"Train {train.Number} successfully departed from station {stationId} with delay {train.delay} seconds");
                return true;
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(train.Number, $"Error reporting train departed: {ex.Message}");
                return false;
            }
        }

        // Mark both trains as completed after a client-reported collision. No broadcast back to clients.
        public void HandleCollision(Train trainA, Train trainB)
        {
            try
            {                
                ServerLogger.Instance.LogWarning(trainA.Number, $"Collision: trains {trainA.Number} and {trainB.Number} by client report");
                trainA.damaged = true;
                trainB.damaged = true;
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(trainA.Number, $"Error handling collision: {ex.Message}");
            }
        }

        // Mark train as completed after a client-reported derailment. No broadcast back to clients.
        public void HandleDerailment(Train train, string stationId, int? switchId)
        {
            try
            {
                train.damaged = true;
                var switchInfo = switchId.HasValue ? $" at switch {switchId.Value}" : string.Empty;
                ServerLogger.Instance.LogWarning(train.Number, $"Derailment: train {train.Number} removed by client report at station {stationId}{switchInfo}");
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(train.Number, $"Error handling derailment: {ex.Message}");
            }
        }

        public List<StationTimetableEvent> GetStationTimetableEvents(string stationId)
        {
            return _timetableService.BuildStationTimetableEvents(_trains, stationId);
        }

        // Manually advance simulation time by a number of seconds and process due events
        public void AdvanceSeconds(double seconds)
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
        }

        public void SetSpeed(int speed)
        {
            if (speed < 1) speed = 1;
            if (speed > 100) speed = 100;
            this.Speed = speed;
            // Broadcast current state including new speed
            _ = _notificationManager.SendSimulationStateChange(this._state, this.Speed);
        }

        public List<TrainDispatcherGame.Server.Models.DTOs.OpenLineTrackStatusDto> GetOpenLineTrackStatuses()
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

        /// <summary>
        /// Handles the report of a station exit being blocked or unblocked by a train route.
        /// It will notify the neighboring station so it can extend the train route to the other station.
        /// </summary>
        /// <param name="playerId">The player id.</param>
        /// <param name="exitId">The exit id of the station that is being blocked or unblocked.</param>
        /// <param name="blocked">True if the exit is blocked, false if it is unblocked.</param>
        public async Task HandleExitBlockStatus(string playerId, int exitId, bool blocked)
        {
            try
            {
                // Get the player's station
                var player = _playerManager.GetPlayer(playerId);
                if (player == null)
                {
                    ServerLogger.Instance.LogWarning(playerId, $"Player {playerId} not found");
                    return;
                }
                
                var stationId = player.StationId;
                
                // Get the connection for this exit
                var connection = _trackLayoutService.GetConnection(stationId, exitId, out bool isReversed);
                if (connection == null)
                {
                    ServerLogger.Instance.LogWarning(stationId, $"No connection found for exit {exitId} at station {stationId}");
                    return;
                }
                
                // Remove train from open-line track when exit is unblocked
                if (!blocked)
                {
                    _openLineTracks.RemoveTrain(connection);
                    ServerLogger.Instance.LogDebug(stationId, $"Train removed from open-line track {connection.FromStation} → {connection.ToStation}");
                }
                
                // Determine the other side of the connection
                string otherStation;
                int otherExitId;
                
                if (isReversed)
                {
                    // This exit is actually the ToExitId, so the other side is FromStation/FromExitId
                    otherStation = connection.FromStation;
                    otherExitId = connection.FromExitId;
                }
                else
                {
                    // This exit is the FromExitId, so the other side is ToStation/ToExitId
                    otherStation = connection.ToStation;
                    otherExitId = connection.ToExitId;
                }
                
                // Notify the other station
                await _notificationManager.SendExitBlockStatus(otherStation, otherExitId, blocked);
                
                ServerLogger.Instance.LogDebug(stationId, $"Exit {exitId} at {stationId} is {(blocked ? "blocked" : "unblocked")}, notified {otherStation} about exit {otherExitId}");
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(playerId, $"Error handling exit block status: {ex.Message}");
            }
        }
    }
}