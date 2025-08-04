using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Services;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Simulation
{
    public class Simulation
    {
        private Timer? _timer;
        private DateTime _simulationStartTime; // The actual simulation start time from timetable
        private DateTime _realStartTime; // When we actually started the simulation
        private SimulationState _state = SimulationState.Stopped;
        private string? _errorMessage;
        private Timetable? _timetable;
        private List<Train> _trains = new();
        private readonly INotificationManager _notificationManager;
        private readonly ITrackLayoutService _trackLayoutService;
        private readonly object _simulationLock = new object(); // Thread synchronization object

        public DateTime CurrentTime => _simulationStartTime.AddSeconds(ElapsedSeconds);
        public double ElapsedSeconds { get; private set; } = 0;
        public SimulationState State => _state;
        public string? ErrorMessage => _errorMessage;
        public Timetable? Timetable => _timetable;
        public List<Train> Trains => _trains;

        public Simulation(INotificationManager notificationManager, ITrackLayoutService trackLayoutService)
        {
            _notificationManager = notificationManager;
            _trackLayoutService = trackLayoutService;
            LoadTimetable();
        }

        private void LoadTimetable()
        {
            try
            {
                var filePath = Path.Combine("data", "timetable.json");
                if (File.Exists(filePath))
                {
                    var json = File.ReadAllText(filePath);
                    _timetable = JsonSerializer.Deserialize<Timetable>(json);

                    if (_timetable != null) ProcessTimetable();

                }
                else
                {
                    Console.WriteLine($"Timetable file not found at: {filePath}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading timetable: {ex.Message}");
            }
        }

        private void ProcessTimetable()
        {
            if (_timetable == null) return;

            _trains.Clear();

            // Parse the start time - this is the actual simulation start time
            if (TimeSpan.TryParse(_timetable.StartTime, out var startTime))
            {
                _simulationStartTime = DateTime.Today.Add(startTime);

                foreach (var trainSchedule in _timetable.Trains)
                {
                    var train = new Train(trainSchedule.Number)
                    {
                        Type = trainSchedule.Type,
                        Speed = trainSchedule.Speed,
                        Path = trainSchedule.Path
                    };



                    // Add station events from timetable only
                    foreach (var timetableEntry in trainSchedule.Timetable)
                    {
                        if (DateTime.TryParse(timetableEntry.Arrival, out var arrivalTime) && DateTime.TryParse(timetableEntry.Departure, out var departureTime))
                        {

                            train.Events.Add(new TrainEvent
                            {
                                Station = timetableEntry.Station,
                                LocationId = timetableEntry.Station,
                                ArrivalTime = arrivalTime,
                                DepartureTime = departureTime,
                            });
                        }
                        else
                        {
                            Console.WriteLine($"Error parsing arrival time for train {trainSchedule.Number} at {timetableEntry.Station}: {timetableEntry.Arrival}");
                        }
                    }// Convert spawn info to TrainSpawn struct
                    if (TimeSpan.TryParse(trainSchedule.Spawn.Time, out var spawnTime))
                    {
                        var spawnDateTime = _simulationStartTime.Add(spawnTime);
                        var firstStation = train.Events.First().Station;

                        // Find the exit point that leads to the first station
                        var exitPoint = _trackLayoutService.GetExitPointToStation(firstStation, train.Path.First());

                        train.Spawn = new TrainSpawn(
                            trainSchedule.Spawn.Type,
                            spawnDateTime,
                            firstStation,
                            exitPoint?.Id ?? -1
                        );
                    }


                    _trains.Add(train);
                }

                Console.WriteLine($"Loaded {_trains.Count} trains from timetable starting at {_simulationStartTime:HH:mm:ss}");
            }
        }

        public void Start()
        {
            if (_state == SimulationState.Running)
            {
                return; // Already running
            }

            if (_state == SimulationState.Paused)
            {
                // Resume from pause
                Resume();
                return;
            }

            try
            {
                // Start fresh
                _realStartTime = DateTime.Now;
                _state = SimulationState.Running;
                _errorMessage = null;

                // Start timer that updates every 100ms (10 times per second)
                _timer = new Timer(UpdateSimulation, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(100));

                Console.WriteLine($"Simulation started at {_simulationStartTime:HH:mm:ss}");
            }
            catch (Exception ex)
            {
                _state = SimulationState.Error;
                _errorMessage = ex.Message;
                Console.WriteLine($"Error starting simulation: {ex.Message}");
            }
        }

        public void Stop()
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
            ProcessTimetable();

            Console.WriteLine("Simulation stopped");
        }

        public void Pause()
        {
            if (_state != SimulationState.Running)
            {
                return; // Not running
            }

            _timer?.Dispose();
            _timer = null;
            _state = SimulationState.Paused;

            Console.WriteLine($"Simulation paused at {CurrentTime:HH:mm:ss}");
        }

        public void Resume()
        {
            if (_state != SimulationState.Paused)
            {
                return; // Not paused
            }

            try
            {
                _realStartTime = DateTime.Now.AddSeconds(-ElapsedSeconds); // Adjust for elapsed time
                _state = SimulationState.Running;
                _errorMessage = null;
                _timer = new Timer(UpdateSimulation, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(100));

                Console.WriteLine($"Simulation resumed at {CurrentTime:HH:mm:ss}");
            }
            catch (Exception ex)
            {
                _state = SimulationState.Error;
                _errorMessage = ex.Message;
                Console.WriteLine($"Error resuming simulation: {ex.Message}");
            }
        }

        private void UpdateSimulation(object? state)
        {
            lock (_simulationLock)
            {
                if (_state == SimulationState.Running)
                {
                    try
                    {
                        // Calculate actual elapsed time since real start
                        var actualElapsed = (DateTime.Now - _realStartTime).TotalSeconds;
                        ElapsedSeconds = actualElapsed;

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
            var currentSimTime = CurrentTime;

            foreach (var train in _trains)
            {
                if (train.completed || train.controlledByPlayer) continue;

                // Check if train should spawn
                if (train.Spawn != null && train.Spawn.IsDue(currentSimTime))
                {
                    HandleTrainSpawn(train);
                }


            }
        }

        private async void HandleTrainSpawn(Train train)
        {
            try
            {
                var spawn = train.Spawn;
                var station = spawn.StationId;
                var exitPointId = spawn.ExitPointId;

                // Use exit point ID if available, otherwise use spawn type
                var locationId = exitPointId.ToString();

                await _notificationManager.SendTrain(station, train, locationId);
                train.controlledByPlayer = true;
                train.CurrentLocation = station;
                train.HeadingForStation = null;

                Console.WriteLine($"Train {train.Number} spawned at spawn point {train.Spawn.Type} {locationId} heading for {station}");
                train.Spawn = null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error spawning train: {ex.Message}");
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

        public void TrainReturnedFromClient(Train train, string destinationStationId)
        {
            try
            {
                Console.WriteLine($"Train {train.Number} returned from client at {train.CurrentLocation} heading for {destinationStationId}");
                train.controlledByPlayer = false;
                train.LastLocation = train.CurrentLocation;
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
                        Console.WriteLine($"Train {train.Number} was missrouted to {_trackLayoutService.GetLayoutTitle(train.HeadingForStation)} instead of {_trackLayoutService.GetLayoutTitle(nextEvent.Station)}");
                        // TODO: handle missrouted train
                    }
                    
                    var exitPoint = _trackLayoutService.GetExitPointToStation(nextEvent.Station, train.LastLocation);
                    if (exitPoint == null) throw new Exception($"No exit point found for train {train.Number} from {nextEvent.Station} to {train.LastLocation}");
                    train.Spawn = new TrainSpawn(
                        "exit",
                        CurrentTime.AddMinutes(1),
                        nextEvent.Station,
                        exitPoint.Id
                    );
                    Console.WriteLine($"Train {train.Number} advanced to next event: {nextEvent.Station} at {train.Spawn.ScheduledTime:HH:mm:ss}");
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

                Console.WriteLine($"Train {train.Number} successfully stopped at station {stationId}");
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
                
                Console.WriteLine($"Train {train.Number} successfully departed from station {stationId}");
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