using System.Text.Json;
using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Services
{
    public interface ITrackLayoutService
    {
        Dictionary<string, TrackLayout> TrackLayouts { get; }
        TrackLayout? GetTrackLayout(string stationId);
        ExitPoint? GetExitPoint(string stationId, int exitId);
        ExitPoint? GetExitPointToStation(string fromStationId, string toStationId);
        List<TrackLayout> GetAllTrackLayouts();
        string GetLayoutTitle(string layoutId);
    }

    public class TrackLayoutService : ITrackLayoutService
    {
        private readonly Dictionary<string, TrackLayout> _trackLayouts = new();

        public Dictionary<string, TrackLayout> TrackLayouts => _trackLayouts;

        public TrackLayoutService()
        {
            LoadTrackLayouts();
        }

        private void LoadTrackLayouts()
        {
            try
            {
                var directoryPath = Path.Combine("TrackLayouts");
                if (!Directory.Exists(directoryPath))
                {
                    Console.WriteLine("TrackLayouts folder not found.");
                    return;
                }

                foreach (var file in Directory.GetFiles(directoryPath, "*.json"))
                {
                    try
                    {
                        var json = File.ReadAllText(file);
                        var trackLayout = JsonSerializer.Deserialize<TrackLayout>(json);

                        if (trackLayout != null)
                        {
                            _trackLayouts[trackLayout.Id] = trackLayout;
                            Console.WriteLine($"Loaded track layout: {trackLayout.Title} ({trackLayout.Id}) with {trackLayout.Exits.Count} exits");
                        }
                    }
                    catch (Exception ex)
                    {
                        var fileName = Path.GetFileName(file);
                        Console.WriteLine($"Error loading track layout {fileName}: {ex.Message}");
                    }
                }

                Console.WriteLine($"Successfully loaded {_trackLayouts.Count} track layouts");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading track layouts: {ex.Message}");
            }
        }

        public TrackLayout? GetTrackLayout(string stationId)
        {
            return _trackLayouts.TryGetValue(stationId, out var layout) ? layout : null;
        }

        public ExitPoint? GetExitPoint(string stationId, int exitId)
        {
            var layout = GetTrackLayout(stationId);
            return layout?.Exits.FirstOrDefault(e => e.Id == exitId);
        }

        public ExitPoint? GetExitPointToStation(string fromStationId, string toStationId)
        {
            var layout = GetTrackLayout(fromStationId);
            return layout?.Exits.FirstOrDefault(e => e.Destination == toStationId);
        }

        public List<TrackLayout> GetAllTrackLayouts()
        {
            return _trackLayouts.Values.ToList();
        }

        public string GetLayoutTitle(string layoutId)
        {
            return _trackLayouts.TryGetValue(layoutId, out var layout) ? layout.Title : "NaN";
        }
    }
}