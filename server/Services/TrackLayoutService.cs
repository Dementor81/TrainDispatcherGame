using System.Text.Json;
using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Models;

namespace TrainDispatcherGame.Server.Services
{
    public class TrackLayoutService
    {
        private readonly Dictionary<string, TrackLayout> _trackLayouts = new();
        private readonly Dictionary<(string stationId, int exitId), NetworkConnection> _directedConnections = new();
        private readonly object _reloadLock = new();
        private string _layoutRoot = string.Empty;
        private string _activeLayoutId = string.Empty;
        private const string _dataDirectory = "data";
        private const string _trackLayoutsSubdirectory = "TrackLayouts";

        public Dictionary<string, TrackLayout> TrackLayouts => _trackLayouts;

        public TrackLayoutService()
        {
            // Start inert; no active layout until explicitly set by SetActiveLayout
            _layoutRoot = ResolveLayoutDirectory(_activeLayoutId);
        }

        public string ActiveLayoutId => _activeLayoutId;

        private string ResolveLayoutDirectory(string layoutId)
        {
            // Base directory is data/TrackLayouts
            var baseDir = Path.Combine(_dataDirectory, _trackLayoutsSubdirectory);
            if (string.IsNullOrWhiteSpace(layoutId))
            {
                return baseDir;
            }
            // Return the specific network folder path
            return Path.Combine(baseDir, layoutId);
        }

        public void SetActiveLayout(string layoutId)
        {
            lock (_reloadLock)
            {
                if (string.IsNullOrWhiteSpace(layoutId))
                {
                    // Clear current state and stay inert until a concrete layout id is provided
                    _trackLayouts.Clear();
                    _directedConnections.Clear();
                    _activeLayoutId = string.Empty;
                    _layoutRoot = ResolveLayoutDirectory(_activeLayoutId);
                    Console.WriteLine("Active layout cleared; TrackLayoutService is idle until a layout is set.");
                    return;
                }

                var newRoot = ResolveLayoutDirectory(layoutId);
                _trackLayouts.Clear();
                _directedConnections.Clear();

                _activeLayoutId = layoutId;
                _layoutRoot = newRoot;

                var requiredStations = LoadNetwork();
                LoadTrackLayouts(requiredStations);
            }
        }

        private void LoadTrackLayouts(string[] requiredStations)
        {
            if (requiredStations.Length == 0)
            {
                Console.WriteLine("No required stations found; skipping track layout loading.");
                return;
            }

            try
            {
                var stationsDirectory = Path.Combine(_layoutRoot, "stations");
                if (!Directory.Exists(stationsDirectory))
                {
                    Console.WriteLine($"Stations folder not found at {stationsDirectory}.");
                    return;
                }

                int loadedCount = 0;
                var missingLayouts = new List<string>();

                foreach (var stationId in requiredStations)
                {
                    var layoutFile = Path.Combine(stationsDirectory, $"{stationId}.json");
                    
                    if (!File.Exists(layoutFile))
                    {
                        missingLayouts.Add(stationId);
                        Console.WriteLine($"Warning: Track layout file not found for station '{stationId}' at {layoutFile}");
                        continue;
                    }

                    try
                    {
                        var json = File.ReadAllText(layoutFile);
                        var dto = JsonSerializer.Deserialize<TrackLayoutDto>(json);

                        if (dto != null)
                        {
                            // Build domain model from DTO
                            // Use stationId (from stations array / file name) as the canonical station ID
                            var model = new TrackLayout
                            {
                                Id = stationId,  // Use stationId from network file, not dto.Id
                                Tracks = dto.Tracks ?? new List<TrackDto>(),
                                Switches = dto.Switches ?? new List<SwitchDto>()
                            };
                            // Compute the maximum distance between any two exit points using in-memory tracks
                            model.MaxExitDistance = ComputeMaxExitDistance(model.Tracks);

                            // Discover exit points from tracks' switches entries
                            var discoveredExitIds = new HashSet<int>();
                            if (dto.Tracks != null)
                            {
                                foreach (var track in dto.Tracks)
                                {
                                    if (track.Switches == null) continue;
                                    int idx = 0;
                                    foreach (var sw in track.Switches)
                                    {
                                        if (sw != null && string.Equals(sw.Type, "Exit", StringComparison.OrdinalIgnoreCase))
                                        {
                                            var exitId = sw.Id;
                                            if (!discoveredExitIds.Contains(exitId))
                                            {
                                                var exit = new ExitPoint { Id = exitId };
                                                // Use stationId for connection lookup, not dto.Id
                                                if (_directedConnections.TryGetValue((stationId, exitId), out var connection))
                                                {
                                                    exit.Connection = connection;
                                                    exit.Destination = connection.ToStation;
                                                }
                                                model.Exits.Add(exit);
                                                discoveredExitIds.Add(exitId);
                                            }
                                        }
                                        idx++;
                                    }
                                }
                            }

                            _trackLayouts[stationId] = model;  // Use stationId as dictionary key
                            loadedCount++;
                            Console.WriteLine($"Loaded track layout: {stationId} with {model.Exits.Count} exits; max span: {model.MaxExitDistance:F2}");
                        }
                        else
                        {
                            Console.WriteLine($"Warning: Failed to deserialize track layout for station '{stationId}'");
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Error loading track layout for station '{stationId}': {ex.Message}");
                    }
                }

                Console.WriteLine($"Successfully loaded {loadedCount} of {requiredStations.Length} required track layouts");
                
                if (missingLayouts.Count > 0)
                {
                    Console.WriteLine($"Missing track layouts: {string.Join(", ", missingLayouts)}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading required track layouts: {ex.Message}");
            }
        }

        private string[] LoadNetwork()
        {
            var requiredStations = new List<string>();
            
            try
            {
                if (string.IsNullOrWhiteSpace(_activeLayoutId))
                {
                    Console.WriteLine("No active layout id set; skipping network load.");
                    return new string[0];
                }

                var networkPath = Path.Combine(_layoutRoot, "network.json");
                if (!File.Exists(networkPath))
                {
                    Console.WriteLine($"Network file 'network.json' not found in '{_layoutRoot}'; skipping network load.");
                    return new string[0];
                }

                var json = File.ReadAllText(networkPath);
                var network = JsonSerializer.Deserialize<NetworkDto>(json);
                if (network == null)
                {
                    Console.WriteLine($"Network file '{_activeLayoutId}.json' is empty or invalid.");
                    return new string[0];
                }

                // Collect required stations from explicit stations list
                if (network.Stations != null)
                {
                    foreach (var station in network.Stations)
                    {
                        if (!string.IsNullOrWhiteSpace(station))
                        {
                            requiredStations.Add(station.ToLowerInvariant());
                        }
                    }
                }
                else
                {
                    Console.WriteLine("No stations found in network.json.");
                    return new string[0];
                }

                if (network.Connections == null)
                {
                    Console.WriteLine("No connections found in network.json.");
                    return new string[0];
                }

                int created = 0;
                foreach (var c in network.Connections)
                {
                    if (string.IsNullOrWhiteSpace(c.FromStation) || string.IsNullOrWhiteSpace(c.ToStation))
                    {
                        Console.WriteLine($"Warning: Invalid connection from '{c.FromStation}' to '{c.ToStation}' in network.json.");
                        continue;
                    }                    
                    
                    var fromExit = c.FromExitId;
                    var toExit = c.ToExitId;

                    var normalizedFromStation = c.FromStation.ToLowerInvariant();
                    var normalizedToStation = c.ToStation.ToLowerInvariant();

                    int sameConnectionCount = network.Connections.Count(conn =>
                        (conn.FromStation.Equals(c.FromStation, StringComparison.OrdinalIgnoreCase) || 
                         conn.FromStation.Equals(c.ToStation, StringComparison.OrdinalIgnoreCase)) && 
                        (conn.ToStation.Equals(c.ToStation, StringComparison.OrdinalIgnoreCase) || 
                         conn.ToStation.Equals(c.FromStation, StringComparison.OrdinalIgnoreCase)));

                    

                    // Create forward connection with normalized station IDs
                    var forward = new NetworkConnection
                    {
                        FromStation = normalizedFromStation,
                        FromExitId = fromExit,
                        ToStation = normalizedToStation,
                        ToExitId = toExit,
                        Distance = c.Distance,
                        Blocks = c.Blocks,
                        Mode =  sameConnectionCount == 1 ? NetworkConnection.TrackMode.SingleTrack : NetworkConnection.TrackMode.Regular,
                    };
                    _directedConnections[(normalizedFromStation, forward.FromExitId)] = forward;
                    created++;
                }



                Console.WriteLine($"Loaded {created} directed network connections");
                Console.WriteLine($"Required track layouts: {string.Join(", ", requiredStations)}");

            foreach (var kvp in _directedConnections)
            {
                var conn = kvp.Value;
                Console.WriteLine($"[Debug] Connection: {conn.FromStation} (Exit {conn.FromExitId}) -> {conn.ToStation} (Exit {conn.ToExitId}), Distance: {conn.Distance}, Blocks: {conn.Blocks}, Mode: {conn.Mode}");
            }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error loading network.json: {ex.Message}");
            }
            
            return requiredStations.ToArray(); 
        }

        // Computes the maximum pairwise distance between all exit points in the layout, based on track endpoints
        private static int ComputeMaxExitDistance(List<TrackDto> tracks)
        {
            if (tracks == null || tracks.Count == 0)
            {
                return 0;
            }

            var exitPoints = new Dictionary<int, (double x, double y)>();

            foreach (var track in tracks)
            {
                if (track.Switches == null || track.Switches.Count == 0)
                {
                    continue;
                }

                bool hasStart = track.Start != null;
                bool hasEnd = track.End != null;
                double startX = track.Start?.X ?? 0d;
                double startY = track.Start?.Y ?? 0d;
                double endX = track.End?.X ?? 0d;
                double endY = track.End?.Y ?? 0d;

                int idx = 0;
                foreach (var sw in track.Switches)
                {
                    if (sw != null && string.Equals(sw.Type, "Exit", StringComparison.OrdinalIgnoreCase))
                    {
                        int exitId = sw.Id;
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
            foreach (var conn in _directedConnections.Values)
            {
                if (conn.FromStation == fromStationId && conn.ToStation == toStationId && (conn.Mode == NetworkConnection.TrackMode.Regular || conn.Mode == NetworkConnection.TrackMode.SingleTrack))
                {
                    var layout = GetTrackLayout(toStationId);
                    if (layout != null)
                        return layout.Exits.FirstOrDefault(e => e.Id == conn.ToExitId);
                }
            }
            return null;
        }

        public List<TrackLayout> GetAllTrackLayouts()
        {
            return _trackLayouts.Values.ToList();
        }

        public IReadOnlyDictionary<(string stationId, int exitId), NetworkConnection> GetDirectedConnections()
        {
            return _directedConnections;
        }

        // Search for connection in both directions (fromStationId, fromExitId) and (toStationId, toExitId)
        public NetworkConnection? GetConnection(string stationId, int exitId, out bool isReversed)
        {
            isReversed = false;
            // Try direct match
            if (_directedConnections.TryGetValue((stationId, exitId), out var conn))
                return conn;

            // Try reverse direction (exit is an entry at the other station)
            foreach (var kvp in _directedConnections)
            {
                var c = kvp.Value;
                if (c.ToStation == stationId && c.ToExitId == exitId)
                {
                    isReversed = true;
                    return c;
                }
            }
            return null;
        }        

        /// <summary>
        /// Get a regular connection to a station. It either returns a forward connection of a two-way or single-track or a reverse connection of a single-track.
        /// Attention: This method should only be used for automatic train routing. For player-controlled stations, use the GetConnection method instead.
        /// </summary>
        /// <param name="fromStationId">The station id of the from station</param>
        /// <param name="toStationId">The station id of the to station</param>
        /// <param name="isReversed">true if the connection direction is actually from toStationId to fromStationId</param>
        /// <returns>The connection if found, null otherwise</returns>
        public NetworkConnection? GetRegularConnectionToStation(string fromStationId, string toStationId, out bool isReversed)
        {
            isReversed = false;
            foreach (var conn in _directedConnections.Values)
            {
                if (conn.FromStation == fromStationId && conn.ToStation == toStationId && (conn.Mode == NetworkConnection.TrackMode.Regular || conn.Mode == NetworkConnection.TrackMode.SingleTrack))
                {
                    return conn;
                }
            }
            // If no forward connection found, allow single-track reverse usage by matching either direction and setting reversed accordingly
            foreach (var conn in _directedConnections.Values)
            {
                if (conn.Mode == NetworkConnection.TrackMode.SingleTrack &&
                    ((conn.FromStation == fromStationId && conn.ToStation == toStationId) ||
                     (conn.FromStation == toStationId && conn.ToStation == fromStationId)))
                {
                    isReversed = conn.FromStation == toStationId;
                    return conn;
                }
            }
            return null;
        }

        public List<NetworkConnection> GetAllConnections()
        {
            return _directedConnections.Values.ToList();
        }

        public TrainDispatcherGame.Server.Models.DTOs.ClientServerCom.ClientTrackLayoutDto? BuildClientTrackLayout(string stationId)
        {
            var layout = GetTrackLayout(stationId);
            if (layout == null) return null;

            var client = new TrainDispatcherGame.Server.Models.DTOs.ClientServerCom.ClientTrackLayoutDto
            {
                Id = layout.Id,
                Tracks = layout.Tracks,
                Switches = layout.Switches,
                MaxExitDistance = layout.MaxExitDistance
            };

            // Add only network connections relevant to this station
            var relevantConnections = GetAllConnections()
                .Where(conn => conn.FromStation == stationId || conn.ToStation == stationId);
            foreach (var conn in relevantConnections)
            {
                client.Connections.Add(new NetworkConnectionDto
                {
                    FromStation = conn.FromStation,
                    FromExitId = conn.FromExitId,
                    ToStation = conn.ToStation,
                    ToExitId = conn.ToExitId,
                    Distance = conn.Distance,
                    Blocks = conn.Blocks,
                    Mode = conn.Mode.ToString()
                });
            }

            return client;
        }

        public bool IsSingleTrackConnection(string stationA, string stationB)
        {
            if (string.IsNullOrWhiteSpace(stationA) || string.IsNullOrWhiteSpace(stationB))
            {
                return false;
            }

            foreach (var conn in _directedConnections.Values)
            {
                if (conn.Mode == NetworkConnection.TrackMode.SingleTrack)
                {
                    if ((conn.FromStation == stationA && conn.ToStation == stationB) ||
                        (conn.FromStation == stationB && conn.ToStation == stationA))
                    {
                        return true;
                    }
                }
            }
            return false;
        }
    }
}