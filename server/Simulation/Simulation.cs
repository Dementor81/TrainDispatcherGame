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
        public Timetable? Timetable => _timeTableService.Timetable;
        public List<Train> Trains => _trains;

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

        private void UpdateSimulation(object? state)
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
        }

        private void CheckTrainEvents()
        {
            foreach (var train in _trains)
            {
                if (train.completed || train.controlledByPlayer) continue;
                // Check if train should spawn
                if (train.Spawn != null && train.Spawn.IsDue(this.SimulationTime))
                {
                    HandleTrainSpawn(train);
                }
            }
        }

        private async void HandleTrainSpawn(Train train)
        {
            try
            {
                if (train.Spawn == null) throw new Exception($"Train {train.Number} has no spawn point");
                var spawn = train.Spawn;
                var station = spawn.StationId;
                var exitPointId = spawn.ExitPointId;

                // Use exit point ID if available, otherwise use spawn type
                var locationId = exitPointId.ToString();

                // If the station is controlled by a player, hand over to the player as usual
                if (_playerManager.IsStationControlled(station))
                {
                    await _notificationManager.SendTrain(station, train, locationId);
                    train.controlledByPlayer = true;
                    train.CurrentLocation = station;
                    train.HeadingForStation = null;

                    Console.WriteLine($"Train {train.Number} spawned at spawn point {locationId} of {station}");
                    train.Spawn = null;
                }
                else
                {
                    train.HeadingForStation = null;
                    train.Spawn = null;

                    var currentEvent = train.GetCurrentEvent();
                    var nextEvent = train.AdvanceToNextEvent();
                    if (nextEvent == null)
                    {
                        Console.WriteLine($"Train {train.Number} has completed all events");
                        train.completed = true;
                        return;
                    }
                    var layout = _trackLayoutService.GetTrackLayout(currentEvent.Station);
                    var seconds = (int)Math.Ceiling(layout.MaxExitDistance / train.Speed);
                    var scheduledTime = SimulationTime.AddSeconds(seconds);
                    CreateSpawnFromCurrentStation(train, currentEvent, nextEvent, scheduledTime);
                    Console.WriteLine($"Train {train.Number} auto-advanced at uncontrolled station {station}; spawning at {nextEvent.Station} at ({scheduledTime:HH:mm:ss})");
                }

            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error spawning train: {ex.Message}");
            }
        }        

        private void CreateSpawnFromCurrentStation(Train train, TrainEvent currentEvent, TrainEvent nextEvent, DateTime scheduledTime)
        {
            var exitPoint = _trackLayoutService.GetExitPointToStation(nextEvent.Station,currentEvent.Station );
            if (exitPoint == null) throw new Exception($"No exit point found for train {train.Number} from {nextEvent.Station} to {currentEvent.Station}");
            train.Spawn = new TrainSpawn(
                scheduledTime,
                nextEvent.Station,
                exitPoint.Id
            );
            
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

                var currentEvent = train.GetCurrentEvent();
                if (currentEvent == null) continue;

                // Check if this train has any future events at the requested station
                var futureEvents = train
                    .GetFutureEvents()
                    .Where(e => e.Station.Equals(stationId, StringComparison.OrdinalIgnoreCase));

                foreach (var futureEvent in futureEvents)
                {
                    // Determine the origin station by looking back for the previous event
                    string fromStation = string.Empty;
                    var allEvents = train.Events;
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
                    // Fallback: if there was no previous event, use the first entry of the path
                    if (string.IsNullOrWhiteSpace(fromStation))
                    {
                        fromStation = (train.Path != null && train.Path.Count > 0) ? train.Path[0] : string.Empty;
                    }

                    // Determine the next station after stopping at the current (futureEvent) station
                    string nextStation = string.Empty;
                    if (eventIndex >= 0 && eventIndex + 1 < allEvents.Count)
                    {
                        nextStation = allEvents[eventIndex + 1].Station;
                    }
                    else
                    {
                        // If this is the last station, use the second station from the path as fallback
                        nextStation = (train.Path != null && train.Path.Count >= 2) ? train.Path[1] : string.Empty;
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

        public void TrainReturnedFromClient(Train train, string destinationStationId)
        {
            try
            {
                Console.WriteLine($"Train {train.Number} returned from client at {train.CurrentLocation} heading for {destinationStationId}");
                train.controlledByPlayer = false;
                var lastLocation = train.CurrentLocation;
                train.CurrentLocation = null;
                train.HeadingForStation = destinationStationId;

                var currentEvent = train.GetCurrentEvent();
                if (currentEvent == null) throw new Exception($"Train {train.Number} has no current event");

                if (!currentEvent.Processed)
                {
                    Console.WriteLine($"Train {train.Number} missed stop at {currentEvent.Station}!");
                }
                var nextEvent = train.AdvanceToNextEvent();
                if (nextEvent == null)
                {
                    Console.WriteLine($"Train {train.Number} has completed all events");
                    train.completed = true;
                }
                else
                {
                    if (nextEvent.Station != train.HeadingForStation)
                    {
                        Console.WriteLine($"Train {train.Number} was missrouted to {train.HeadingForStation} instead of {nextEvent.Station}");
                        // TODO: handle missrouted train
                    }

                    if (string.IsNullOrEmpty(lastLocation))
                    {
                        throw new Exception($"No last known location for train {train.Number}");
                    }
                    // Use the same spawn-creation logic as uncontrolled station flow, but keep old minute-based delay for now
                    CreateSpawnFromCurrentStation(train, currentEvent, nextEvent, SimulationTime.AddMinutes(1));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error returning train from client: {ex.Message}");
                throw;
            }
        }

        public bool ReportTrainStopped(Train train, string stationId)
        {
            try
            {
                var currentEvent = train.GetCurrentEvent();
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
                var currentEvent = train.GetCurrentEvent();
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
    }
}