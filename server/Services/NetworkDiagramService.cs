using System.Text;
using System.Text.Json;
using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Services.NetworkDiagram;

namespace TrainDispatcherGame.Server.Services;

public class NetworkDiagramService
{
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
        var graph = new NetworkGraph(network);
        var layout = new NetworkLayout(graph);
        new OrthogonalRouter(graph, layout).Route();
        return new NetworkSvgWriter(graph).Write(layout.Width, layout.Height);
    }
}
