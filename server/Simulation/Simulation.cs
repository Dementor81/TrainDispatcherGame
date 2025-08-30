using System;
using System.Threading;
using System.Threading.Tasks;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Services;
using System.Collections.Generic;
using System.Linq;
using TrainDispatcherGame.Server.Models.DTOs;
using Microsoft.VisualBasic;

namespace TrainDispatcherGame.Server.Simulation
{
    public class Simulation
    {
        public const double TimerInterval = 1000;
        public const int SimulationScale = 10;

        private Timer? _timer;
        private SimulationState _state = SimulationState.Stopped;
        private string? _errorMessage;
        private List<Train> _trains = new();
        private readonly INotificationManager _notificationManager;
        private readonly PlayerManager _playerManager;
        private readonly ITrackLayoutService _trackLayoutService;
        private readonly ITimeTableService _timeTableService;
        private readonly object _simulationLock = new object(); // Thread synchronization object

        public DateTime SimulationTime => _timeTableService.SimulationStartTime.AddSeconds(ElapsedSeconds);
        public double ElapsedSeconds { get; private set; } = 0;
        public SimulationState State => _state;
        public string? ErrorMessage => _errorMessage;
        public SzenarioDTO? Timetable => _timeTableService.Timetable;
        public List<Train> Trains => _trains;

        public int Speed { get; set; } = 1;

        public Simulation(INotificationManager notificationManager, ITrackLayoutService trackLayoutService, ITimeTableService timeTableService, PlayerManager playerManager)
        {
            _notificationManager = notificationManager;
            _trackLayoutService = trackLayoutService;
            _timeTableService = timeTableService;
            _playerManager = playerManager;
            this.Reset();
        }

        private void Reset()
        {
            _trains.Clear();
            _trains = _timeTableService.LoadTrainsFromTimetable(_trackLayoutService);
            this.CreateInitialSpawnEvents();

            foreach (var train in _trains)
            {
                if (train.NextServerEvent != null)
                {
                    if (train.NextServerEvent is TrainSpawnEvent tse)
                    {
                        Console.WriteLine($"[DEBUG] Train {train.Number} spawn event: Station={tse.Station}, ExitPointId={tse.ExitPointId}, ScheduledTime={tse.ScheduledTime:HH:mm:ss}");
                    }
                    else if (train.NextServerEvent is SendApprovalEvent sae)
                    {
                        Console.WriteLine($"[DEBUG] Train {train.Number} approval event scheduled at {sae.ScheduledTime:HH:mm:ss}");
                    }
                }
                else
                {
                    Console.WriteLine($"[DEBUG] Train {train.Number} has no next server event.");
                }
            }
        }

        private void CreateInitialSpawnEvents()
        {
            try
            {
                foreach (var train in _trains)
                {
                    // Compute spawn time based on station span and train speed
                    var firstWayPoint = train.Route.FirstOrDefault();
                    if (firstWayPoint != null)
                    {
                        if (firstWayPoint.IsFake) //Train is comming from another station
                        {
                            var firstStation = firstWayPoint.Station;
                            var nextWayPoint = train.GetNextWayPoint();
                            if (nextWayPoint == null) throw new Exception($"Train {train.Number} does not have enough way points");
                            var nextStation = nextWayPoint.Station;
                            var layout = _trackLayoutService.GetTrackLayout(nextStation);
                            if (layout == null) throw new Exception($"Track layout not found for station {nextStation}");
                            int span = layout.MaxExitDistance;
                            if (span == 0) throw new Exception($"Track layout for station {nextStation} has no exits or its span could not be computed");
                            int travelSeconds = train.GetTravelTime(span / 2);
                            var spawnDateTime = nextWayPoint.ArrivalTime - TimeSpan.FromSeconds(travelSeconds);

                            train.NextServerEvent = this.CreateSpawnFromCurrentStation(train, firstWayPoint, nextWayPoint, spawnDateTime);
                            train.AdvanceToNextWayPoint();
                        }
                        else if (firstWayPoint.ArrivalTime == DateTime.MinValue && firstWayPoint.DepartureTime != DateTime.MinValue)
                        {
                            train.NextServerEvent = new TrainSpawnEvent(
                                firstWayPoint.DepartureTime.AddSeconds(-60),
                                firstWayPoint.Station,
                                -1
                            );
                            train.AdvanceToNextWayPoint();
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error creating initial spawn events: {ex.Message}");
            }
        }
        #region Start, Stop, Pause, Resume
        public async void Start()
        {
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

                Console.WriteLine($"Simulation started at {_timeTableService.SimulationStartTime:HH:mm:ss}");

                // Notify all clients about the state change
                await _notificationManager.SendSimulationStateChange(_state);
            }
            catch (Exception ex)
            {
                _state = SimulationState.Error;
                _errorMessage = ex.Message;
                Console.WriteLine($"Error starting simulation: {ex.Message}");
                await _notificationManager.SendSimulationStateChange(_state);
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
            Reset();

            Console.WriteLine("Simulation stopped");

            // Notify all clients about the state change
            await _notificationManager.SendSimulationStateChange(_state);
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

            Console.WriteLine($"Simulation paused at {SimulationTime:HH:mm:ss}");

            // Notify all clients about the state change
            await _notificationManager.SendSimulationStateChange(_state);
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

                Console.WriteLine($"Simulation resumed at {SimulationTime:HH:mm:ss}");

                // Notify all clients about the state change
                await _notificationManager.SendSimulationStateChange(_state);
            }
            catch (Exception ex)
            {
                _state = SimulationState.Error;
                _errorMessage = ex.Message;
                Console.WriteLine($"Error resuming simulation: {ex.Message}");
            }
        }
        #endregion

        private async void UpdateSimulation(object? state)
        {
            await Task.Run(() =>
            {
                lock (_simulationLock)
                {
                    if (_state == SimulationState.Running)
                    {
                        try
                        {
                            this.ElapsedSeconds += TimerInterval / 1000;
                            CheckTrainEvents();
                        }
                        catch (Exception ex)
                        {
                            _state = SimulationState.Error;
                            _errorMessage = ex.Message;
                            Console.WriteLine($"Error in simulation update: {ex.Message}");
                        }
                    }
                }
            });
        }

        private async Task CheckTrainEvents()
        {
            foreach (var train in _trains)
            {
                if (train.completed || train.controlledByPlayer) continue;
                if (train.NextServerEvent == null) continue;

                if (!train.NextServerEvent.IsDue(this.SimulationTime)) continue;

                if (train.NextServerEvent is TrainSpawnEvent)
                {
                    await HandleTrainSpawn(train);
                }
                else if (train.NextServerEvent is SendApprovalEvent)
                {
                    await HandleSendApproval(train, train.NextServerEvent as SendApprovalEvent);
                }
            }
        }

        private async Task HandleTrainSpawn(Train train)
        {
            try
            {
                if (train.NextServerEvent == null) throw new Exception($"Train {train.Number} has no spawn point");
                var spawn = train.NextServerEvent as TrainSpawnEvent;
                if (spawn == null) throw new Exception($"Train {train.Number} next event is not a spawn event");
                var station = spawn.Station;
                var exitPointId = spawn.ExitPointId.ToString();

                // If the station is controlled by a player, hand over to the player as usual
                if (_playerManager.IsStationControlled(station))
                {
                    if (exitPointId == "-1") throw new Exception($"Train {train.Number} has exit point id -1, this shouldnt be possible for player controlled stations");
                    await _notificationManager.SendTrain(station, train, exitPointId);
                    train.controlledByPlayer = true;
                    train.CurrentLocation = station;

                    Console.WriteLine($"Train {train.Number} spawned at spawn point {exitPointId} of {station}");
                    train.NextServerEvent = null;
                }
                else
                {
                    await DispatchTrainByServer(train);
                }

            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error spawning train: {ex.Message}");
            }
        }

        private TrainSpawnEvent CreateSpawnFromCurrentStation(Train train, TrainWayPoint currentEvent, TrainWayPoint nextEvent, DateTime scheduledTime)
        {

            var exitPoint = _trackLayoutService.GetExitPointToStation(currentEvent.Station, nextEvent.Station);
            if (exitPoint == null) throw new Exception($"No exit point found for train {train.Number} from {nextEvent.Station} to {currentEvent.Station}");
            return new TrainSpawnEvent(
                scheduledTime,
                nextEvent.Station,
                exitPoint.Id
            );
        }

        private async Task DispatchTrainByServer(Train train)
        {
            Console.WriteLine($"Dispatching train {train.Number} by server");
            var currentWaypoint = train.GetWayPoint();
            var nextWaypoint = train.GetNextWayPoint();
            if (currentWaypoint == null) throw new Exception($"Train {train.Number} has no current way point");
            if (nextWaypoint == null) throw new Exception($"Train {train.Number} has no next way point");
            if (nextWaypoint.IsFake) //we dont need to handle anything further, because there is no waypoint after this
            {
                Console.WriteLine($"Train {train.Number} has completed all events");
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

                train.NextServerEvent = new SendApprovalEvent(approvalTime);
                Console.WriteLine($"Train {train.Number} scheduled approval request for departure {currentWaypoint.Station} -> {nextWaypoint.Station} at {approvalTime:HH:mm:ss}");
                return;
            }
            else
            {
                var layout = _trackLayoutService.GetTrackLayout(currentWaypoint.Station);
                var distance = layout.MaxExitDistance;
                var connection = _trackLayoutService.GetRegularConnectionToStation(currentWaypoint.Station, nextWaypoint.Station);
                if (connection == null) throw new Exception($"No regular connection found for train {train.Number} from {currentWaypoint.Station} to {nextWaypoint.Station}");
                distance += connection.Distance;
                var seconds = train.GetTravelTime(distance);

                var scheduledTime = SimulationTime.AddSeconds(seconds);
                train.NextServerEvent = CreateSpawnFromCurrentStation(train, currentWaypoint, nextWaypoint, scheduledTime);
                train.AdvanceToNextWayPoint();
                Console.WriteLine($"Train {train.Number} auto-advanced at uncontrolled station {currentWaypoint.Station}; spawning at {nextWaypoint.Station} at ({scheduledTime:HH:mm:ss})");
            }
        }

        private async Task HandleSendApproval(Train train, SendApprovalEvent sendApprovalEvent)
        {
            try
            {
                if (sendApprovalEvent.ApprovalSent) return;

                var currentWaypoint = train.GetWayPoint();
                var nextWaypoint = train.GetNextWayPoint();
                if (currentWaypoint == null || nextWaypoint == null) throw new Exception($"Train {train.Number} cannot request approval without valid waypoints");

                await _notificationManager.SendApprovalRequest(nextWaypoint.Station, currentWaypoint.Station, train.Number);
                Console.WriteLine($"Train {train.Number} sent approval request for {currentWaypoint.Station} -> {nextWaypoint.Station}");
                sendApprovalEvent.ApprovalSent = true;

            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error sending approval: {ex.Message}");
            }
        }

        public void ClearError()
        {
            if (_state == SimulationState.Error)
            {
                _state = SimulationState.Stopped;
                _errorMessage = null;
                Console.WriteLine("Simulation error cleared");
            }
        }

        public List<Train> GetActiveTrains()
        {
            return _trains.Where(t => !t.completed).ToList();
        }

        public List<Train> GetCompletedTrains()
        {
            return _trains.Where(t => t.completed).ToList();
        }

        public List<StationTimetableEvent> GetStationTimetableEvents(string stationId)
        {
            var stationEvents = new List<StationTimetableEvent>();

            foreach (var train in _trains)
            {
                if (train.completed) continue;

                var currentEvent = train.GetWayPoint();
                if (currentEvent == null) continue;

                // Check if this train has any future events at the requested station
                var futureEvents = train
                    .GetFutureWayPoints()
                    .Where(e => e.Station.Equals(stationId, StringComparison.OrdinalIgnoreCase));

                foreach (var futureEvent in futureEvents)
                {
                    // Determine the origin station by looking back for the previous event
                    string fromStation = string.Empty;
                    var allEvents = train.Route;
                    var eventIndex = allEvents.IndexOf(futureEvent);
                    if (eventIndex > 0)
                    {
                        // Walk backwards to find the previous event
                        for (int i = eventIndex - 1; i >= 0; i--)
                        {
                            var prev = allEvents[i];
                            if (prev != null)
                            {
                                fromStation = prev.Station;
                                break;
                            }
                        }
                    }


                    // Determine the next station after stopping at the current (futureEvent) station
                    string nextStation = string.Empty;
                    if (eventIndex >= 0 && eventIndex + 1 < allEvents.Count)
                    {
                        nextStation = allEvents[eventIndex + 1].Station;
                    }


                    stationEvents.Add(new StationTimetableEvent
                    {
                        TrainNumber = train.Number,
                        Arrival = futureEvent.ArrivalTime.ToString("HH:mm:ss"),
                        Departure = futureEvent.DepartureTime.ToString("HH:mm:ss"),
                        CurrentDelay = train.delay,
                        FromStation = fromStation,
                        NextStation = nextStation
                    });
                }
            }

            // Sort by arrival time
            stationEvents.Sort((a, b) =>
            {
                if (DateTime.TryParse(a.Arrival, out var arrivalA) &&
                    DateTime.TryParse(b.Arrival, out var arrivalB))
                {
                    return arrivalA.CompareTo(arrivalB);
                }
                return string.Compare(a.Arrival, b.Arrival, StringComparison.Ordinal);
            });

            return stationEvents;
        }

        public async Task TrainReturnedFromClient(Train train, string exitId)
        {
            try
            {
                Console.WriteLine($"Train {train.Number} returned from client at {train.CurrentLocation} at Exit {exitId}");
                if (!int.TryParse(exitId, out var exitPointId)) throw new Exception($"Invalid exit ID: {exitId}");
                if (train.CurrentLocation == null) throw new Exception($"Train {train.Number} has no current location");

                var connection = _trackLayoutService.GetConnection(train.CurrentLocation, exitPointId);
                if (connection == null) throw new Exception($"No exit point found for train {train.Number} at {train.CurrentLocation} at Exit {exitId}");


                train.controlledByPlayer = false;
                var lastLocation = train.CurrentLocation;
                train.CurrentLocation = null;

                var currentEvent = train.GetWayPoint();
                if (currentEvent == null) throw new Exception($"Train {train.Number} has no current event");

                if (!currentEvent.Processed)
                {
                    Console.WriteLine($"Train {train.Number} missed stop at {currentEvent.Station}!");
                }
                var nextEvent = train.AdvanceToNextWayPoint();
                if (nextEvent == null)
                {
                    Console.WriteLine($"This should not happend, probably a bug in train scheduling, Train {train.Number} has completed all events after it returned from a station");
                    train.completed = true;
                    return;
                }

                if (nextEvent.Station != connection.ToStation)
                {
                    Console.WriteLine($"Train {train.Number} was missrouted to {connection.ToStation} instead of {nextEvent.Station}");
                    // TODO: handle missrouted train
                }

                if (!train.HasMoreWayPoints())
                {
                    Console.WriteLine($"Train {train.Number} has completed all events");
                    train.completed = true;
                }
                else
                {
                    CreateSpawnFromCurrentStation(train, currentEvent, nextEvent, SimulationTime.AddSeconds(train.GetTravelTime(connection.Distance)));
                }

            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error returning train from client: {ex.Message}");
                throw;
            }
        }

        public void ReceiveApproval(string trainNumber, string fromStationId, bool approved)
        {
            try
            {
                var train = _trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    Console.WriteLine($"Approval for unknown train {trainNumber}");
                    return;
                }
                var sendApprovalEvent = train.NextServerEvent as SendApprovalEvent;
                if (sendApprovalEvent == null) throw new Exception($"Train {train.Number} next event is not a send approval event");

                if (!approved)
                {
                    Console.WriteLine($"Approval denied for train {train.Number}");
                    sendApprovalEvent.ApprovalDenied();
                    return;
                }



                Console.WriteLine($"Approval received for train {train.Number} from {fromStationId}");

                // Schedule spawn event now that approval is granted
                var currentWaypoint = train.GetWayPoint();
                var nextWaypoint = train.GetNextWayPoint();
                if (currentWaypoint == null || nextWaypoint == null)
                {
                    Console.WriteLine($"Train {train.Number} missing waypoints after approval");
                    return;
                }

                var layout = _trackLayoutService.GetTrackLayout(currentWaypoint.Station);
                if (layout == null) throw new Exception($"Train {train.Number}: Track layout not found for station {currentWaypoint.Station}");
                var distance = layout.MaxExitDistance / 2; //only half the distance, assuming the trains stops at the middleof the station
                var connection = _trackLayoutService.GetRegularConnectionToStation(currentWaypoint.Station, nextWaypoint.Station);
                if (connection == null) throw new Exception($"No regular connection found for train {train.Number} from {currentWaypoint.Station} to {nextWaypoint.Station}");
                distance += connection.Distance;
                var travelTime = train.GetTravelTime(distance);

                var departureTime = currentWaypoint.DepartureTime > SimulationTime ? currentWaypoint.DepartureTime : SimulationTime;

                if (departureTime > SimulationTime)
                    train.delay = (int)(departureTime - SimulationTime).TotalSeconds;

                var scheduledTime = departureTime.AddSeconds(travelTime);
                train.NextServerEvent = CreateSpawnFromCurrentStation(train, currentWaypoint, nextWaypoint, scheduledTime);

                train.AdvanceToNextWayPoint();
                Console.WriteLine($"Train {train.Number} scheduled spawn event for {nextWaypoint.Station} at {scheduledTime:HH:mm:ss}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing approval: {ex.Message}");
            }
        }

        public bool ReportTrainStopped(Train train, string stationId)
        {
            try
            {
                var currentEvent = train.GetWayPoint();
                if (currentEvent == null)
                {
                    Console.WriteLine($"Train {train.Number} has no current event to mark as stopped");
                    return false;
                }

                if (currentEvent.Station != stationId)
                {
                    Console.WriteLine($"Train {train.Number} reported stopped at {stationId} but current event is for station {currentEvent.Station}");
                    return false;
                }

                if (currentEvent.Processed)
                {
                    Console.WriteLine($"Train {train.Number} station event at {stationId} is already processed");
                    return false;
                }

                // Mark the current station event as processed
                currentEvent.Processed = true;
                train.delay = (int)(SimulationTime - currentEvent.ArrivalTime).TotalSeconds;

                Console.WriteLine($"Train {train.Number} successfully stopped at station {stationId} with delay {train.delay} seconds");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting train stopped: {ex.Message}");
                return false;
            }
        }

        public bool ReportTrainDeparted(Train train, string stationId)
        {
            try
            {
                var currentEvent = train.GetWayPoint();
                if (currentEvent == null)
                {
                    Console.WriteLine($"Train {train.Number} has no current event to mark as departed");
                    return false;
                }

                if (currentEvent.Station != stationId)
                {
                    Console.WriteLine($"Train {train.Number} reported departed from {stationId} but current event is for station {currentEvent.Station}");
                    return false;
                }

                if (!currentEvent.Processed)
                {
                    Console.WriteLine($"Train {train.Number} station event at {stationId} is not yet processed (must stop before departing)");
                    return false;
                }


                train.delay = (int)(SimulationTime - currentEvent.DepartureTime).TotalSeconds;

                Console.WriteLine($"Train {train.Number} successfully departed from station {stationId} with delay {train.delay} seconds");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting train departed: {ex.Message}");
                return false;
            }
        }

        // Mark both trains as completed after a client-reported collision. No broadcast back to clients.
        public void HandleCollision(Train trainA, Train trainB)
        {
            try
            {
                trainA.completed = true;
                trainB.completed = true;
                Console.WriteLine($"Collision: trains {trainA.Number} and {trainB.Number} removed by client report");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error handling collision: {ex.Message}");
            }
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
    }
}