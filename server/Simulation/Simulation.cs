using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using TrainDispatcherGame.Server.Models;
using System.Collections.Generic;
using System.IO;
using System.Linq;

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
        
        public DateTime CurrentTime => _simulationStartTime.AddSeconds(ElapsedSeconds);
        public double ElapsedSeconds { get; private set; } = 0;
        public SimulationState State => _state;
        public string? ErrorMessage => _errorMessage;
        public Timetable? Timetable => _timetable;
        public List<Train> Trains => _trains;

        public Simulation()
        {
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
                    var train = new Train(trainSchedule.Number);
                    
                    foreach (var entry in trainSchedule.Entries)
                    {
                        if (TimeSpan.TryParse(entry.Time, out var eventTime))
                        {
                            // Calculate event time relative to simulation start time
                            var eventDateTime = _simulationStartTime.Add(eventTime - startTime);
                            
                            train.Events.Add(new TrainEvent
                            {
                                Type = entry.Type,
                                LocationId = entry.Id,
                                ScheduledTime = eventDateTime,
                                Stops = entry.Stops
                            });
                        }
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
            if (_state == SimulationState.Running)
            {
                try
                {
                    // Calculate actual elapsed time since real start
                    var actualElapsed = (DateTime.Now - _realStartTime).TotalSeconds;
                    ElapsedSeconds = actualElapsed;
                    
                    // Check for train events
                    CheckTrainEvents();
                    
                    // TODO: Add train logic here later
                    // This is where we'll update train positions, handle signals, etc.
                }
                catch (Exception ex)
                {
                    _state = SimulationState.Error;
                    _errorMessage = ex.Message;
                    Console.WriteLine($"Error in simulation update: {ex.Message}");
                }
            }
        }

        private void CheckTrainEvents()
        {
            var currentSimTime = CurrentTime;
            
            foreach (var train in _trains)
            {
                if (train.IsEventDue(currentSimTime))
                {
                    ProcessTrainEvent(train);
                }
            }
        }

        private void ProcessTrainEvent(Train train)
        {
            var currentEvent = train.GetCurrentEvent();
            if (currentEvent == null) return;

            Console.WriteLine($"Train {train.Number}: {currentEvent.Type} at {currentEvent.LocationId} at {currentEvent.ScheduledTime:HH:mm:ss}");
            
            // Mark event as processed
            currentEvent.Processed = true;
            
            // Update train state
            if (train.State == TrainState.Waiting)
            {
                train.State = TrainState.Active;
                train.SpawnTime = CurrentTime;
            }
            
            // Advance to next event
            train.AdvanceToNextEvent();
            
            // Check if train has completed all events
            if (!train.HasMoreEvents())
            {
                train.State = TrainState.Completed;
                Console.WriteLine($"Train {train.Number} has completed all events");
            }
            
            // TODO: Implement actual event processing logic
            // This is where we'll spawn trains, handle arrivals/departures, etc.
        }

        public void Reset()
        {
            Stop();
            ElapsedSeconds = 0;
            _errorMessage = null;
            
            // Reset all trains
            foreach (var train in _trains)
            {
                train.Reset();
            }
            
            Console.WriteLine($"Simulation reset to {_simulationStartTime:HH:mm:ss}");
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
            return _trains.Where(t => t.State == TrainState.Active).ToList();
        }

        public List<Train> GetWaitingTrains()
        {
            return _trains.Where(t => t.State == TrainState.Waiting).ToList();
        }

        public List<Train> GetCompletedTrains()
        {
            return _trains.Where(t => t.State == TrainState.Completed).ToList();
        }

        public List<TrainEvent> GetUpcomingEvents(int count = 10)
        {
            var allEvents = new List<TrainEvent>();
            
            foreach (var train in _trains)
            {
                var currentEvent = train.GetCurrentEvent();
                if (currentEvent != null && !currentEvent.Processed)
                {
                    allEvents.Add(currentEvent);
                }
            }
            
            return allEvents
                .OrderBy(e => e.ScheduledTime)
                .Take(count)
                .ToList();
        }
    }
}