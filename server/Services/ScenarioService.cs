using System.Text.Json;
using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Services
{
    public interface IScenarioService
    {
        List<ScenarioSummary> ListScenarios();
        SzenarioDTO? GetScenarioById(string id);
    }

    public class ScenarioService : IScenarioService
    {
        private readonly string _dataDirectory;

        public ScenarioService()
        {
            _dataDirectory = Path.Combine("data");
        }

        public List<ScenarioSummary> ListScenarios()
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

        public SzenarioDTO? GetScenarioById(string id)
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
    }
}


