using System.Globalization;
using System.Net;
using System.Text;

namespace TrainDispatcherGame.Server.Services.NetworkDiagram;

/// <summary>Writes the routed layout out as the SVG network plan.</summary>
public class NetworkSvgWriter
{
    private const double CornerRadius = 9;
    private const int FontSize = 17;
    private const string LineColour = "#495057";
    private const string BorderColour = "#212529";

    private readonly NetworkGraph _graph;

    public NetworkSvgWriter(NetworkGraph graph)
    {
        _graph = graph;
    }

    public string Write(double width, double height)
    {
        var builder = new StringBuilder();
        builder.AppendLine(Invariant(
            $"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:0.##} {height:0.##}" role="img">"""));
        builder.AppendLine("""  <title>Rail network diagram</title>""");
        builder.AppendLine("""  <rect width="100%" height="100%" fill="#f8f9fa"/>""");

        foreach (var edge in _graph.Edges)
        {
            builder.AppendLine(Invariant(
                $"""  <path d="{Path(edge.Points)}" fill="none" stroke="{LineColour}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>"""));
        }

        foreach (var station in _graph.Stations)
        {
            var dash = station.IsExternal ? " stroke-dasharray=\"7 5\"" : string.Empty;
            builder.AppendLine(Invariant(
                $"""  <rect x="{station.Left:0.##}" y="{station.Top:0.##}" width="{station.Width:0.##}" height="{station.Height:0.##}" rx="14" fill="#ffffff" stroke="{BorderColour}" stroke-width="3"{dash}/>"""));
            builder.AppendLine(Invariant(
                $"""  <text x="{station.CenterX:0.##}" y="{station.CenterY + FontSize * 0.35:0.##}" text-anchor="middle" font-family="sans-serif" font-size="{FontSize}" fill="{BorderColour}">{WebUtility.HtmlEncode(station.Label)}</text>"""));
        }

        builder.AppendLine("</svg>");
        return builder.ToString();
    }

    /// <summary>Builds the path data, rounding off every corner of the route.</summary>
    private static string Path(IReadOnlyList<(double X, double Y)> points)
    {
        if (points.Count == 0)
        {
            return string.Empty;
        }

        var builder = new StringBuilder(Invariant($"M {points[0].X:0.##} {points[0].Y:0.##}"));
        for (var index = 1; index < points.Count - 1; index++)
        {
            var previous = points[index - 1];
            var corner = points[index];
            var next = points[index + 1];
            var radius = Math.Min(
                CornerRadius,
                Math.Min(Distance(previous, corner), Distance(corner, next)) / 2);
            var start = Towards(corner, previous, radius);
            var end = Towards(corner, next, radius);
            builder.Append(Invariant(
                $" L {start.X:0.##} {start.Y:0.##} Q {corner.X:0.##} {corner.Y:0.##} {end.X:0.##} {end.Y:0.##}"));
        }

        var last = points[^1];
        builder.Append(Invariant($" L {last.X:0.##} {last.Y:0.##}"));
        return builder.ToString();
    }

    private static double Distance((double X, double Y) from, (double X, double Y) to)
    {
        return Math.Sqrt(Math.Pow(to.X - from.X, 2) + Math.Pow(to.Y - from.Y, 2));
    }

    private static (double X, double Y) Towards((double X, double Y) from, (double X, double Y) to, double distance)
    {
        var length = Distance(from, to);
        if (length == 0)
        {
            return from;
        }

        return (from.X + (to.X - from.X) / length * distance, from.Y + (to.Y - from.Y) / length * distance);
    }

    private static string Invariant(FormattableString text)
    {
        return text.ToString(CultureInfo.InvariantCulture);
    }
}
