using System;
using System.Text.Json;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Services
{
    public interface ITimeTableService
    {
        SzenarioDTO? Timetable { get; }
        DateTime SimulationStartTime { get; }
        List<Train> LoadTrainsFromTimetable(ITrackLayoutService trackLayoutService);
        void ReloadTimetable();
    }

    public class TimeTableService : ITimeTableService
    {
        private SzenarioDTO? _timetable;
        private DateTime _simulationStartTime;

        public SzenarioDTO? Timetable => _timetable;
        public DateTime SimulationStartTime => _simulationStartTime;

        public TimeTableService()
        {
            LoadTimetable();
        }

        private void LoadTimetable()
        {
            try
            {
                var filePath = Path.Combine("data", "timetable2.json");
                if (File.Exists(filePath))
                {
                    var json = File.ReadAllText(filePath);
                    _timetable = JsonSerializer.Deserialize<SzenarioDTO>(json);

                    if (_timetable != null)
                    {
                        ProcessTimetableStartTime();
                    }
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

        private void ProcessTimetableStartTime()
        {
            if (_timetable == null) return;

            // Parse the start time - this is the actual simulation start time
            if (TimeSpan.TryParse(_timetable.StartTime, out var startTime))
            {
                _simulationStartTime = DateTime.Today.Add(startTime);
                Console.WriteLine($"Timetable start time set to: {_simulationStartTime:HH:mm:ss}");
            }
            else
            {
                Console.WriteLine($"Error parsing timetable start time: {_timetable.StartTime}");
            }
        }

        public List<Train> LoadTrainsFromTimetable(ITrackLayoutService trackLayoutService)
        {
            var trains = new List<Train>();

            if (_timetable == null) return trains;

            foreach (var trainSchedule in _timetable.Trains)
            {
                var train = new Train(trainSchedule.Number)
                {
                    Type = trainSchedule.Type,
                    Speed = trainSchedule.Speed / 3.6d, //the time table json is in km/h, we need to convert to m/s
                    Path = trainSchedule.Path,
                    Cars = trainSchedule.Cars
                };

                // Add station events from timetable only
                foreach (var timetableEntry in trainSchedule.Timetable)
                {
                    DateTime arrivalTime = DateTime.MinValue;
                    DateTime departureTime = DateTime.MinValue;

                    if (!string.IsNullOrEmpty(timetableEntry.Arrival))
                    {
                        if (!DateTime.TryParse(timetableEntry.Arrival, out arrivalTime))
                        {
                            throw new Exception($"Error parsing arrival time for train {trainSchedule.Number} at {timetableEntry.Station}: {timetableEntry.Arrival}");
                        }
                    }

                    if (!string.IsNullOrEmpty(timetableEntry.Departure))
                    {
                        if (!DateTime.TryParse(timetableEntry.Departure, out departureTime))
                        {
                            throw new Exception($"Error parsing departure time for train {trainSchedule.Number} at {timetableEntry.Station}: {timetableEntry.Departure}");
                        }
                    }

                    train.Route.Add(new TrainWayPoint
                    {
                        Station = timetableEntry.Station,
                        LocationId = timetableEntry.Station,
                        ArrivalTime = arrivalTime,
                        DepartureTime = departureTime,
                    });
                }

                

                

                trains.Add(train);
            }

            Console.WriteLine($"Loaded {trains.Count} trains from timetable starting at {_simulationStartTime:HH:mm:ss}");

            return trains;
        }

        public void ReloadTimetable()
        {
            LoadTimetable();
        }


    }
} 