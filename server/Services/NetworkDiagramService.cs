using System.Net;
using System.Text;
using System.Text.Json;
using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Services;

public class NetworkDiagramService
{
    private const int BoxWidth = 150;
    private const int BoxHeight = 54;
    private const int ColumnGap = 220;
    private const int RowGap = 110;
    private const int Margin = 40;
    private static readonly string LayoutRoot =
        Path.GetFullPath(Path.Combine("data", "TrackLayouts"));

    public string GetDiagram(string layoutId)
    {
        var layoutPath = GetLayoutPath(layoutId);
        var networkPath = Path.Combine(layoutPath, "network.json");
        var diagramPath = Path.Combine(layoutPath, "network.svg");
        var assemblyPath = typeof(NetworkDiagramService).Assembly.Location;

        if (!File.Exists(networkPath))
        {
            throw new FileNotFoundException($"Network file for layout '{layoutId}' not found.");
        }

        if (!File.Exists(diagramPath) ||
            File.GetLastWriteTimeUtc(diagramPath) < File.GetLastWriteTimeUtc(networkPath) ||
            !string.IsNullOrEmpty(assemblyPath) &&
            File.GetLastWriteTimeUtc(diagramPath) < File.GetLastWriteTimeUtc(assemblyPath))
        {
            var network = JsonSerializer.Deserialize<NetworkDto>(File.ReadAllText(networkPath))
                ?? throw new InvalidDataException("network.json is empty.");
            var svg = CreateSvg(network);
            File.WriteAllText(diagramPath, svg, new UTF8Encoding(false));
        }

        return File.ReadAllText(diagramPath);
    }

    private static string GetLayoutPath(string layoutId)
    {
        if (string.IsNullOrWhiteSpace(layoutId))
        {
            throw new ArgumentException("Layout ID is required.");
        }

        var path = Path.GetFullPath(Path.Combine(LayoutRoot, layoutId));
        if (!path.StartsWith(LayoutRoot + Path.DirectorySeparatorChar, StringComparison.Ordinal))
        {
            throw new ArgumentException("Invalid layout ID.");
        }

        return path;
    }

    private static string CreateSvg(NetworkDto network)
    {
        var connections = network.Connections
            .Where(connection =>
                !string.IsNullOrWhiteSpace(connection.FromStation) &&
                !string.IsNullOrWhiteSpace(connection.ToStation))
            .Select(connection =>
            {
                connection.FromStation = Normalize(connection.FromStation);
                connection.ToStation = Normalize(connection.ToStation);
                return connection;
            })
            .ToList();

        var labels = network.Stations
            .Where(station => !string.IsNullOrWhiteSpace(station.Id))
            .GroupBy(station => Normalize(station.Id))
            .ToDictionary(
                group => group.Key,
                group => string.IsNullOrWhiteSpace(group.First().Name)
                    ? group.First().Id
                    : group.First().Name);
        var internalStations = labels.Keys.ToHashSet();
        var stationIds = internalStations
            .Concat(connections.SelectMany(connection =>
                new[] { connection.FromStation, connection.ToStation }))
            .Distinct()
            .OrderBy(id => id, StringComparer.Ordinal)
            .ToList();

        if (stationIds.Count == 0)
        {
            throw new InvalidDataException("network.json contains no stations.");
        }

        foreach (var id in stationIds)
        {
            labels.TryAdd(id, id);
        }

        var edges = connections
            .Select(connection => OrderedPair(connection.FromStation, connection.ToStation))
            .GroupBy(edge => edge)
            .Select(group => (
                group.Key.First,
                group.Key.Second,
                ConnectionCount: group.Count()))
            .ToList();
        var adjacency = stationIds.ToDictionary(id => id, _ => new List<string>());
        foreach (var (first, second, _) in edges)
        {
            adjacency[first].Add(second);
            adjacency[second].Add(first);
        }
        foreach (var neighbors in adjacency.Values)
        {
            neighbors.Sort(StringComparer.Ordinal);
        }

        var positions = LayoutStations(stationIds, adjacency, connections);
        return RenderSvg(positions, edges, labels, internalStations);
    }

    private static Dictionary<string, (int X, int Y)> LayoutStations(
        List<string> stationIds,
        Dictionary<string, List<string>> adjacency,
        List<NetworkConnectionDto> connections)
    {
        var result = new Dictionary<string, (int X, int Y)>();
        var connected = stationIds.Where(id => adjacency[id].Count > 0).ToHashSet();
        var remaining = connected.ToHashSet();
        var yOffset = 0;

        while (remaining.Count > 0)
        {
            var seed = remaining.OrderBy(id => id, StringComparer.Ordinal).First();
            var component = GetComponent(seed, adjacency);
            remaining.ExceptWith(component);

            var local = LayoutComponent(component, adjacency, connections);
            var minY = local.Values.Min(position => position.Y);
            var maxY = local.Values.Max(position => position.Y);
            foreach (var (id, position) in local)
            {
                result[id] = (position.X, position.Y - minY + yOffset);
            }
            yOffset += maxY - minY + 2;
        }

        var isolated = stationIds.Where(id => adjacency[id].Count == 0).ToList();
        for (var index = 0; index < isolated.Count; index++)
        {
            result[isolated[index]] = (index, yOffset);
        }

        return result;
    }

    private static HashSet<string> GetComponent(
        string seed,
        Dictionary<string, List<string>> adjacency)
    {
        var component = new HashSet<string>();
        var queue = new Queue<string>();
        queue.Enqueue(seed);

        while (queue.TryDequeue(out var station))
        {
            if (!component.Add(station))
            {
                continue;
            }
            foreach (var neighbor in adjacency[station])
            {
                queue.Enqueue(neighbor);
            }
        }

        return component;
    }

    private static Dictionary<string, (int X, int Y)> LayoutComponent(
        HashSet<string> component,
        Dictionary<string, List<string>> adjacency,
        List<NetworkConnectionDto> connections)
    {
        var startCandidates = component
            .Where(id => adjacency[id].All(neighbor =>
                IsRight(id, neighbor, connections)))
            .OrderBy(id => id, StringComparer.Ordinal)
            .ToList();
        var start = startCandidates.FirstOrDefault()
            ?? component.OrderBy(id => id, StringComparer.Ordinal).First();
        var spine = FindBestRightPath(start, component, adjacency, connections, new HashSet<string>());
        var positions = new Dictionary<string, (int X, int Y)>();

        for (var index = 0; index < spine.Count; index++)
        {
            positions[spine[index]] = (index, 0);
        }

        while (positions.Count < component.Count)
        {
            var next = component
                .Where(id => !positions.ContainsKey(id))
                .SelectMany(id => adjacency[id]
                    .Where(positions.ContainsKey)
                    .Select(parent => (Id: id, Parent: parent)))
                .OrderBy(pair => pair.Parent, StringComparer.Ordinal)
                .ThenBy(pair => pair.Id, StringComparer.Ordinal)
                .First();

            var parentPosition = positions[next.Parent];
            var right = IsRight(next.Parent, next.Id, connections);
            var x = parentPosition.X + (right ? 1 : -1);
            var sameSideNeighbors = adjacency[next.Parent]
                .Where(neighbor => IsRight(next.Parent, neighbor, connections) == right)
                .OrderBy(id => id, StringComparer.Ordinal)
                .ToList();
            var primary = sameSideNeighbors.FirstOrDefault(positions.ContainsKey);
            var branchIndex = sameSideNeighbors
                .Where(id => id != primary)
                .ToList()
                .IndexOf(next.Id);
            var y = sameSideNeighbors.Count > 1 && next.Id != primary
                ? parentPosition.Y + AlternatingLane(branchIndex)
                : parentPosition.Y;

            while (positions.Values.Contains((x, y)))
            {
                y += y <= parentPosition.Y ? 1 : -2;
            }
            positions[next.Id] = (x, y);
        }

        return positions;
    }

    private static List<string> FindBestRightPath(
        string station,
        HashSet<string> component,
        Dictionary<string, List<string>> adjacency,
        List<NetworkConnectionDto> connections,
        HashSet<string> visited)
    {
        visited.Add(station);
        var best = new List<string> { station };

        var candidates = adjacency[station]
            .Where(neighbor =>
                component.Contains(neighbor) &&
                !visited.Contains(neighbor) &&
                IsRight(station, neighbor, connections))
            .OrderByDescending(neighbor => !IsRight(neighbor, station, connections))
            .ThenBy(id => id, StringComparer.Ordinal);

        foreach (var neighbor in candidates)
        {
            var path = FindBestRightPath(
                neighbor,
                component,
                adjacency,
                connections,
                new HashSet<string>(visited));
            path.Insert(0, station);
            var pathScore = ScorePath(path, adjacency);
            var bestScore = ScorePath(best, adjacency);
            if (pathScore > bestScore ||
                pathScore == bestScore &&
                string.CompareOrdinal(string.Join('\0', path), string.Join('\0', best)) < 0)
            {
                best = path;
            }
        }

        return best;
    }

    private static int ScorePath(
        List<string> path,
        Dictionary<string, List<string>> adjacency)
    {
        var skippedConnections = 0;
        for (var first = 0; first < path.Count; first++)
        {
            for (var second = first + 2; second < path.Count; second++)
            {
                if (adjacency[path[first]].Contains(path[second]))
                {
                    skippedConnections++;
                }
            }
        }

        return path.Count * 100 - skippedConnections * 200;
    }

    private static bool IsRight(
        string station,
        string neighbor,
        List<NetworkConnectionDto> connections)
    {
        var connection = connections.FirstOrDefault(candidate =>
            candidate.FromStation == station && candidate.ToStation == neighbor);
        if (connection != null)
        {
            return connection.FromExitId % 2 != 0;
        }

        connection = connections.First(candidate =>
            candidate.FromStation == neighbor && candidate.ToStation == station);
        return connection.ToExitId % 2 != 0;
    }

    private static int AlternatingLane(int index)
    {
        var distance = index / 2 + 1;
        return index % 2 == 0 ? -distance : distance;
    }

    private static string RenderSvg(
        Dictionary<string, (int X, int Y)> positions,
        List<(string First, string Second, int ConnectionCount)> edges,
        Dictionary<string, string> labels,
        HashSet<string> internalStations)
    {
        var minX = positions.Values.Min(position => position.X);
        var maxX = positions.Values.Max(position => position.X);
        var minY = positions.Values.Min(position => position.Y);
        var maxY = positions.Values.Max(position => position.Y);
        var width = (maxX - minX) * ColumnGap + BoxWidth + Margin * 2;
        var height = (maxY - minY) * RowGap + BoxHeight + Margin * 2;
        var builder = new StringBuilder();

        builder.AppendLine($"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img">""");
        builder.AppendLine("""  <title>Rail network diagram</title>""");
        builder.AppendLine("""  <rect width="100%" height="100%" fill="#f8f9fa"/>""");

        foreach (var (first, second, connectionCount) in edges)
        {
            var from = ToPixels(positions[first], minX, minY);
            var to = ToPixels(positions[second], minX, minY);
            if (connectionCount == 1)
            {
                AppendLine(builder, from, to, 0);
                continue;
            }

            AppendLine(builder, from, to, -6);
            AppendLine(builder, from, to, 6);
        }

        foreach (var id in positions.Keys.OrderBy(id => id, StringComparer.Ordinal))
        {
            var center = ToPixels(positions[id], minX, minY);
            var x = center.X - BoxWidth / 2;
            var y = center.Y - BoxHeight / 2;
            var dash = internalStations.Contains(id) ? string.Empty : " stroke-dasharray=\"7 5\"";
            builder.AppendLine($"""  <rect x="{x}" y="{y}" width="{BoxWidth}" height="{BoxHeight}" rx="14" fill="#ffffff" stroke="#212529" stroke-width="3"{dash}/>""");
            builder.AppendLine($"""  <text x="{center.X}" y="{center.Y + 6}" text-anchor="middle" font-family="sans-serif" font-size="17" fill="#212529">{WebUtility.HtmlEncode(labels[id])}</text>""");
        }

        builder.AppendLine("</svg>");
        return builder.ToString();
    }

    private static void AppendLine(
        StringBuilder builder,
        (int X, int Y) from,
        (int X, int Y) to,
        double offset)
    {
        var length = Math.Sqrt(Math.Pow(to.X - from.X, 2) + Math.Pow(to.Y - from.Y, 2));
        var offsetX = length == 0 ? 0 : -(to.Y - from.Y) / length * offset;
        var offsetY = length == 0 ? 0 : (to.X - from.X) / length * offset;
        builder.AppendLine(FormattableString.Invariant(
            $"""  <line x1="{from.X + offsetX:0.##}" y1="{from.Y + offsetY:0.##}" x2="{to.X + offsetX:0.##}" y2="{to.Y + offsetY:0.##}" stroke="#495057" stroke-width="4"/>"""));
    }

    private static (int X, int Y) ToPixels(
        (int X, int Y) position,
        int minX,
        int minY)
    {
        return (
            Margin + BoxWidth / 2 + (position.X - minX) * ColumnGap,
            Margin + BoxHeight / 2 + (position.Y - minY) * RowGap);
    }

    private static (string First, string Second) OrderedPair(string first, string second)
    {
        return string.CompareOrdinal(first, second) <= 0
            ? (first, second)
            : (second, first);
    }

    private static string Normalize(string id)
    {
        return id.Trim().ToLowerInvariant();
    }
}
