using System.Text.Json;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Services
{

    public static class ScenarioService
    {
        private const string _dataDirectory = "data";

        static ScenarioService()
        {
        }

        public static List<ScenarioSummary> ListScenarios()
        {
            var summaries = new List<ScenarioSummary>();
            try
            {
                if (!Directory.Exists(_dataDirectory))
                {
                    return summaries;
                }

                var files = Directory.EnumerateFiles(_dataDirectory, "*.json", SearchOption.TopDirectoryOnly)
                    .OrderBy(f => f, StringComparer.OrdinalIgnoreCase);

                foreach (var file in files)
                {
                    try
                    {
                        var json = File.ReadAllText(file);
                        var dto = JsonSerializer.Deserialize<SzenarioDTO>(json);
                        var id = Path.GetFileNameWithoutExtension(file);
                        var title = dto?.Title;
                        summaries.Add(new ScenarioSummary
                        {
                            Id = id ?? string.Empty,
                            Title = string.IsNullOrWhiteSpace(title) ? id ?? string.Empty : title!
                        });
                    }
                    catch
                    {
                        // Skip malformed files
                    }
                }
            }
            catch
            {
                // Ignore listing errors and return what we have
            }

            return summaries;
        }

        public static SzenarioDTO? GetScenarioById(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return null;
            var filePath = Path.Combine(_dataDirectory, id + ".json");
            if (!File.Exists(filePath))
            {
                return null;
            }

            try
            {
                var json = File.ReadAllText(filePath);
                return JsonSerializer.Deserialize<SzenarioDTO>(json);
            }
            catch
            {
                return null;
            }
        }

        private static SzenarioDTO LoadScenarioFile(string filePath)
        {
            try
            {
                var json = File.ReadAllText(filePath);
                if(json == null) throw new Exception($"Scenario file {filePath} is empty");
                var scenario = JsonSerializer.Deserialize<SzenarioDTO>(json);
                if(scenario == null) throw new Exception($"Scenario file {filePath} is invalid");
                return scenario;
                
            }
            catch(Exception ex)
            {
                throw new Exception($"Error loading scenario file {filePath}: {ex.Message}");
            }
        }       

        public static Scenario LoadTrainsFromScenario(string scenarioId)
        {
            if (string.IsNullOrWhiteSpace(scenarioId)) throw new Exception("Scenario ID must not be empty");
            var filePath = Path.Combine(_dataDirectory, scenarioId + ".json");
            if (!File.Exists(filePath)) throw new Exception($"Scenario file not found: {filePath}");
            var scenarioDTO = LoadScenarioFile(filePath);

            var trains = new List<Train>();

            foreach (var trainSchedule in scenarioDTO.Trains)
            {
                var train = new Train(trainSchedule.Number)
                {
                    Type = trainSchedule.Type,
                    Speed = trainSchedule.Speed / 3.6d,
                    Cars = trainSchedule.Cars
                };

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

                    train.Route.Add(new TrainWayPoint(timetableEntry.Station, arrivalTime, departureTime));
                }

                train.Route.Last().IsLast = true; //save if the waypoint is the last waypoint, in order to make it easier to detect if the train has completed all waypoints.
                trains.Add(train);
            }

            
            if (!DateTime.TryParse(scenarioDTO.StartTime, out var startTime))
            {
                throw new Exception($"Error parsing start time for scenario {scenarioId}: {scenarioDTO.StartTime}");
            }

            if (string.IsNullOrWhiteSpace(scenarioDTO.LayoutId))
            {
                throw new Exception($"Scenario '{scenarioId}' is missing required 'layout' field");
            }
            var layoutId = scenarioDTO.LayoutId;
            var scenario = new Scenario(scenarioDTO.Title, layoutId, startTime, trains);

            return scenario;
        }
    }
}


