using System.Text.Json;
using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Models;

namespace TrainDispatcherGame.Server.Services
{
    public interface ITrackLayoutService
    {
        Dictionary<string, TrackLayout> TrackLayouts { get; }
        TrackLayout? GetTrackLayout(string stationId);
        ExitPoint? GetExitPoint(string stationId, int exitId);
        ExitPoint? GetExitPointToStation(string fromStationId, string toStationId);
        List<TrackLayout> GetAllTrackLayouts();
        IReadOnlyDictionary<(string stationId, int exitId), NetworkConnection> GetDirectedConnections();
        NetworkConnection? GetConnection(string fromStationId, int fromExitId);
        NetworkConnection? GetRegularConnection(string fromStationId, int fromExitId);
        NetworkConnection? GetRegularConnectionToStation(string fromStationId, string toStationId);
    }

    public class TrackLayoutService : ITrackLayoutService
    {
        private readonly Dictionary<string, TrackLayout> _trackLayouts = new();
        private readonly Dictionary<(string stationId, int exitId), NetworkConnection> _directedConnections = new();

        public Dictionary<string, TrackLayout> TrackLayouts => _trackLayouts;

        public TrackLayoutService()
        {
            LoadTrackLayouts();
            LoadNetwork();
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
                    var fileNameOnly = Path.GetFileName(file);
                    if (string.Equals(fileNameOnly, "network.json", StringComparison.OrdinalIgnoreCase))
                    {
                        // Skip network.json here; handled separately
                        continue;
                    }
                    try
                    {
                        var json = File.ReadAllText(file);
                        var trackLayout = JsonSerializer.Deserialize<TrackLayout>(json);

                        if (trackLayout != null)
                        {
                        // Compute the maximum distance between any two exit points in this layout
                        trackLayout.MaxExitDistance = ComputeMaxExitDistance(json);
                            _trackLayouts[trackLayout.Id] = trackLayout;
                            Console.WriteLine($"Loaded track layout: {trackLayout.Id} with {trackLayout.Exits.Count} exits; max span: {trackLayout.MaxExitDistance:F2}");
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

        private void LoadNetwork()
        {
            try
            {
                var networkPath = Path.Combine("TrackLayouts", "network.json");
                if (!File.Exists(networkPath))
                {
                    Console.WriteLine("network.json not found; skipping network load.");
                    return;
                }

                var json = File.ReadAllText(networkPath);
                var network = JsonSerializer.Deserialize<NetworkDto>(json);
                if (network == null || network.Connections == null)
                {
                    Console.WriteLine("network.json is empty or invalid.");
                    return;
                }

                int created = 0;
                foreach (var c in network.Connections)
                {
                    if (string.IsNullOrWhiteSpace(c.FromStation) || string.IsNullOrWhiteSpace(c.ToStation))
                    {
                        continue;
                    }

                    if (!int.TryParse(c.FromExitId, out var fromExit)) continue;
                    if (!int.TryParse(c.ToExitId, out var toExit)) continue;

                    TrackMode mode = TrackMode.Regular;

                    // Create forward connection
                    var forward = new NetworkConnection
                    {
                        FromStation = c.FromStation,
                        FromExitId = fromExit,
                        ToStation = c.ToStation,
                        ToExitId = toExit,
                        Distance = c.Distance,
                        Blocks = c.Blocks,
                        Mode =  Enum.TryParse(c.Mode, out mode) ? mode : TrackMode.Regular,
                    };
                    _directedConnections[(forward.FromStation, forward.FromExitId)] = forward;
                    created++;

                    // Create reverse connection
                    var reverse = new NetworkConnection
                    {
                        FromStation = c.ToStation,
                        FromExitId = toExit,
                        ToStation = c.FromStation,
                        ToExitId = fromExit,
                        Distance = c.Distance,
                        Blocks = c.Blocks,
                        Mode =  Enum.TryParse(c.Mode, out mode) ? mode : TrackMode.Regular,
                    };
                    _directedConnections[(reverse.FromStation, reverse.FromExitId)] = reverse;
                    created++;
                }

                Console.WriteLine($"Loaded {created} directed network connections");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading network.json: {ex.Message}");
            }
        }

        // Computes the maximum pairwise distance between all exit points in the layout
        private static int ComputeMaxExitDistance(string rawJson)
        {
            try
            {
                using var document = JsonDocument.Parse(rawJson);
                if (!document.RootElement.TryGetProperty("tracks", out var tracksElement) || tracksElement.ValueKind != JsonValueKind.Array)
                {
                    return 0;
                }

                var exitPoints = new Dictionary<int, (double x, double y)>();

                foreach (var track in tracksElement.EnumerateArray())
                {
                    // We expect two endpoints per track; switches array items correspond to start/end
                    if (!track.TryGetProperty("switches", out var switchesEl) || switchesEl.ValueKind != JsonValueKind.Array)
                    {
                        continue;
                    }

                    // Read endpoints
                    bool hasStart = false;
                    bool hasEnd = false;
                    double startX = 0d, startY = 0d, endX = 0d, endY = 0d;

                    if (track.TryGetProperty("start", out var startEl))
                    {
                        if (startEl.TryGetProperty("x", out var sxEl) && startEl.TryGetProperty("y", out var syEl))
                        {
                            startX = sxEl.GetDouble();
                            startY = syEl.GetDouble();
                            hasStart = true;
                        }
                    }

                    if (track.TryGetProperty("end", out var endEl))
                    {
                        if (endEl.TryGetProperty("x", out var exEl) && endEl.TryGetProperty("y", out var eyEl))
                        {
                            endX = exEl.GetDouble();
                            endY = eyEl.GetDouble();
                            hasEnd = true;
                        }
                    }

                    int idx = 0;
                    foreach (var sw in switchesEl.EnumerateArray())
                    {
                        if (sw.ValueKind == JsonValueKind.Object &&
                            sw.TryGetProperty("type", out var typeEl) &&
                            typeEl.GetString() == "Exit" &&
                            sw.TryGetProperty("id", out var exitIdEl) &&
                            exitIdEl.ValueKind == JsonValueKind.Number)
                        {
                            int exitId = exitIdEl.GetInt32();
                            // Map the exit to the corresponding endpoint by index
                            if (idx == 0 && hasStart)
                            {
                                exitPoints[exitId] = (startX, startY);
                            }
                            else if (idx == 1 && hasEnd)
                            {
                                exitPoints[exitId] = (endX, endY);
                            }
                        }
                        idx++;
                    }
                }

                if (exitPoints.Count < 2)
                {
                    return 0;
                }

                var exitList = exitPoints.Values.ToList();
                double maxDistance = 0d;
                for (int i = 0; i < exitList.Count; i++)
                {
                    for (int j = i + 1; j < exitList.Count; j++)
                    {
                        var dx = exitList[i].x - exitList[j].x;
                        var dy = exitList[i].y - exitList[j].y;
                        var distance = Math.Sqrt(dx * dx + dy * dy);
                        if (distance > maxDistance)
                        {
                            maxDistance = distance;
                        }
                    }
                }

                return (int)maxDistance;
            }
            catch
            {
                return 0;
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

        public IReadOnlyDictionary<(string stationId, int exitId), NetworkConnection> GetDirectedConnections()
        {
            return _directedConnections;
        }

        public NetworkConnection? GetConnection(string fromStationId, int fromExitId)
        {
            return _directedConnections.TryGetValue((fromStationId, fromExitId), out var conn) ? conn : null;
        }

        public NetworkConnection? GetRegularConnection(string fromStationId, int fromExitId)
        {
            if (_directedConnections.TryGetValue((fromStationId, fromExitId), out var conn))
            {
                if (conn.Mode == TrackMode.Regular) return conn;
            }
            return null;
        }

        public NetworkConnection? GetRegularConnectionToStation(string fromStationId, string toStationId)
        {
            foreach (var conn in _directedConnections.Values)
            {
                if (conn.FromStation == fromStationId && conn.ToStation == toStationId && conn.Mode == TrackMode.Regular)
                {
                    return conn;
                }
            }
            return null;
        }
    }
}