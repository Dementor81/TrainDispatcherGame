using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Services.NetworkDiagram;

/// <summary>
/// Turns network.json into the graph the diagram is drawn from: one node per
/// station and one edge per connection, with the exits of every station
/// collected into left and right ports.
/// </summary>
public class NetworkGraph
{
    private readonly Dictionary<string, StationNode> _stations = new(StringComparer.Ordinal);

    public NetworkGraph(NetworkDto network)
    {
        foreach (var station in network.Stations)
        {
            if (string.IsNullOrWhiteSpace(station.Id))
            {
                continue;
            }

            var id = Normalize(station.Id);
            var label = string.IsNullOrWhiteSpace(station.Name) ? station.Id : station.Name;
            _stations[id] = new StationNode(id, label, false);
        }

        var edges = new List<NetworkEdge>();
        foreach (var connection in network.Connections)
        {
            if (string.IsNullOrWhiteSpace(connection.FromStation) ||
                string.IsNullOrWhiteSpace(connection.ToStation))
            {
                continue;
            }

            var from = GetOrAddExternal(Normalize(connection.FromStation));
            var to = GetOrAddExternal(Normalize(connection.ToStation));
            if (ReferenceEquals(from, to))
            {
                continue;
            }

            from.AddExit(connection.FromExitId);
            to.AddExit(connection.ToExitId);
            edges.Add(new NetworkEdge(from, connection.FromExitId, to, connection.ToExitId));
        }

        if (_stations.Count == 0)
        {
            throw new InvalidDataException("network.json contains no stations.");
        }

        Stations = _stations.Values.OrderBy(station => station.Id, StringComparer.Ordinal).ToList();
        Edges = edges;
    }

    public IReadOnlyList<StationNode> Stations { get; }

    public IReadOnlyList<NetworkEdge> Edges { get; }

    private StationNode GetOrAddExternal(string id)
    {
        if (_stations.TryGetValue(id, out var existing))
        {
            return existing;
        }

        var station = new StationNode(id, id, true);
        _stations[id] = station;
        return station;
    }

    private static string Normalize(string id)
    {
        return id.Trim().ToLowerInvariant();
    }
}
