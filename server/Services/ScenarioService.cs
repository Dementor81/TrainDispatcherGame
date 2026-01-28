using System.Text.Json;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Services
{

    public static class ScenarioService
    {
        private const string _dataDirectory = "data";
        private const string _trackLayoutsSubdirectory = "TrackLayouts";

        static ScenarioService()
        {
        }

        public static List<ScenarioSummary> ListScenarios()
        {
            var summaries = new List<ScenarioSummary>();
            try
            {
                var trackLayoutsPath = Path.Combine(_dataDirectory, _trackLayoutsSubdirectory);
                if (!Directory.Exists(trackLayoutsPath))
                {
                    return summaries;
                }

                // Iterate through each network folder
                foreach (var networkDir in Directory.EnumerateDirectories(trackLayoutsPath))
                {
                    var networkId = Path.GetFileName(networkDir);
                    var scenariosDir = Path.Combine(networkDir, "scenarios");
                    
                    if (!Directory.Exists(scenariosDir))
                    {
                        continue;
                    }

                    var scenarioFiles = Directory.EnumerateFiles(scenariosDir, "*.json", SearchOption.TopDirectoryOnly)
                        .OrderBy(f => f, StringComparer.OrdinalIgnoreCase);

                    foreach (var file in scenarioFiles)
                    {
                        try
                        {
                            var json = File.ReadAllText(file);
                            var dto = JsonSerializer.Deserialize<SzenarioDTO>(json);
                            var scenarioFileName = Path.GetFileNameWithoutExtension(file);
                            // Scenario ID format: {networkId}/{scenarioFileName}
                            var scenarioId = $"{networkId}/{scenarioFileName}";
                            var title = dto?.Title;
                            summaries.Add(new ScenarioSummary
                            {
                                Id = scenarioId,
                                Title = string.IsNullOrWhiteSpace(title) ? scenarioId : title!
                            });
                        }
                        catch
                        {
                            // Skip malformed files
                        }
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

            // Clients may URL-encode the id (notably '/' as %2F). Normalize before parsing.
            id = Uri.UnescapeDataString(id);
            
            // Parse scenario ID format: {networkId}/{scenarioFileName}
            var parts = id.Split('/', 2);
            if (parts.Length != 2)
            {
                return null;
            }

            var networkId = parts[0];
            var scenarioFileName = parts[1];
            
            var filePath = Path.Combine(_dataDirectory, _trackLayoutsSubdirectory, networkId, "scenarios", scenarioFileName + ".json");
            if (!File.Exists(filePath))
            {
                return null;
            }

            try
            {
                var json = File.ReadAllText(filePath);
                var dto = JsonSerializer.Deserialize<SzenarioDTO>(json);
                if (dto == null) return null;

                // Always derive the layout from the scenario id's network folder to keep things consistent.
                dto.Layout = networkId;
                return dto;
            }
            catch
            {
                return null;
            }
        }

        public static void SaveScenario(string id, SzenarioDTO scenario)
        {
            if (string.IsNullOrWhiteSpace(id))
            {
                throw new Exception("Scenario ID must not be empty");
            }

            if (scenario == null)
            {
                throw new ArgumentNullException(nameof(scenario));
            }

            // Clients may URL-encode the id (notably '/' as %2F). Normalize before parsing.
            id = Uri.UnescapeDataString(id);
            
            // Parse scenario ID format: {networkId}/{scenarioFileName}
            var parts = id.Split('/', 2);
            if (parts.Length != 2)
            {
                throw new Exception($"Invalid scenario ID format: '{id}'. Expected format: '{{networkId}}/{{scenarioFileName}}'");
            }

            var networkId = parts[0];
            var scenarioFileName = parts[1];
            
            // Validate that the network directory exists
            var networkDir = Path.Combine(_dataDirectory, _trackLayoutsSubdirectory, networkId);
            if (!Directory.Exists(networkDir))
            {
                throw new Exception($"Network directory not found: {networkId}");
            }

            // Ensure scenarios directory exists
            var scenariosDir = Path.Combine(networkDir, "scenarios");
            if (!Directory.Exists(scenariosDir))
            {
                Directory.CreateDirectory(scenariosDir);
            }

            // Build the file path
            var filePath = Path.Combine(scenariosDir, scenarioFileName + ".json");

            // Serialize to JSON with proper formatting
            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            };

            var json = JsonSerializer.Serialize(scenario, options);

            // Write to file
            File.WriteAllText(filePath, json);
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

            // Normalize URL-encoded ids (e.g. %2F) in case scenario id came from an HTTP path segment.
            scenarioId = Uri.UnescapeDataString(scenarioId);
            
            // Parse scenario ID format: {networkId}/{scenarioFileName}
            var parts = scenarioId.Split('/', 2);
            if (parts.Length != 2)
            {
                throw new Exception($"Invalid scenario ID format: '{scenarioId}'. Expected format: '{{networkId}}/{{scenarioFileName}}'");
            }

            var networkId = parts[0];
            var scenarioFileName = parts[1];
            
            var filePath = Path.Combine(_dataDirectory, _trackLayoutsSubdirectory, networkId, "scenarios", scenarioFileName + ".json");
            if (!File.Exists(filePath)) throw new Exception($"Scenario file not found: {filePath}");
            var scenarioDTO = LoadScenarioFile(filePath);

            var trains = new List<Train>();

            foreach (var trainSchedule in scenarioDTO.Trains)
            {
                var train = new Train(trainSchedule.Number)
                {
                    Type = trainSchedule.Type,
                    Category = trainSchedule.Category,
                    Speed = trainSchedule.Speed / 3.6d,
                    Cars = trainSchedule.Cars,
                    FollowingTrainNumber = trainSchedule.FollowingTrainNumber
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

            // Layout ID is determined by the network folder containing the scenario
            var layoutId = networkId;
            var scenario = new Scenario(scenarioDTO.Title, layoutId, startTime, trains);

            return scenario;
        }
    }
}


