using System.Globalization;
using System.Net;
using System.Text;

namespace TrainDispatcherGame.Server.Services.NetworkDiagram;

/// <summary>
/// Writes the routed layout out as the SVG network plan. The background stays
/// transparent and every station is a group of its own carrying its id, name
/// and box, so a client can inline the plan, hit test the stations and recolour
/// them. The colours are plain attributes, which any stylesheet overrides, so
/// the plan still looks right when it is shown as a bare image.
/// </summary>
public class NetworkSvgWriter
{
    private const double CornerRadius = 9;
    private const int FontSize = 17;
    private const string LineColour = "#495057";
    private const string BorderColour = "#212529";
    private const string StationFill = "#ffffff";

    private readonly NetworkGraph _graph;

    public NetworkSvgWriter(NetworkGraph graph)
    {
        _graph = graph;
    }

    public string Write(double width, double height)
    {
        var title = string.IsNullOrWhiteSpace(_graph.Name) ? "Rail network" : _graph.Name;
        var builder = new StringBuilder();

        builder.AppendLine(Invariant(
            $"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:0.##} {height:0.##}" class="network-plan" data-network="{Encode(_graph.Name)}">"""));
        builder.AppendLine($"  <title>{Encode(title)} network plan</title>");

        builder.AppendLine(
            $"""  <g class="connections" fill="none" stroke="{LineColour}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">""");
        foreach (var edge in _graph.Edges)
        {
            builder.AppendLine(Invariant(
                $"""    <path class="connection" data-from="{Encode(edge.From.Id)}" data-from-exit="{edge.FromExitId}" data-to="{Encode(edge.To.Id)}" data-to-exit="{edge.ToExitId}" d="{Path(edge.Points)}"/>"""));
        }

        builder.AppendLine("  </g>");
        builder.AppendLine("""  <g class="stations">""");

        foreach (var station in _graph.Stations)
        {
            AppendStation(builder, station);
        }

        builder.AppendLine("  </g>");
        builder.AppendLine("</svg>");
        return builder.ToString();
    }

    private static void AppendStation(StringBuilder builder, StationNode station)
    {
        var external = station.IsExternal ? "true" : "false";
        var dash = station.IsExternal ? " stroke-dasharray=\"7 5\"" : string.Empty;

        builder.AppendLine(Invariant(
            $"""    <g class="station" id="station-{Encode(ElementId(station.Id))}" data-station-id="{Encode(station.Id)}" data-station-name="{Encode(station.Label)}" data-external="{external}" data-x="{station.Left:0.##}" data-y="{station.Top:0.##}" data-width="{station.Width:0.##}" data-height="{station.Height:0.##}">"""));
        builder.AppendLine(Invariant(
            $"""      <rect class="station-box" x="{station.Left:0.##}" y="{station.Top:0.##}" width="{station.Width:0.##}" height="{station.Height:0.##}" rx="14" fill="{StationFill}" stroke="{BorderColour}" stroke-width="3"{dash}/>"""));
        builder.AppendLine(Invariant(
            $"""      <text class="station-label" x="{station.CenterX:0.##}" y="{station.CenterY + FontSize * 0.35:0.##}" text-anchor="middle" font-family="sans-serif" font-size="{FontSize}" fill="{BorderColour}">{Encode(station.Label)}</text>"""));
        builder.AppendLine("    </g>");
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

    /// <summary>Station ids come from folder names, so keep only what an id may contain.</summary>
    private static string ElementId(string id)
    {
        var characters = id.Select(character =>
            char.IsLetterOrDigit(character) || character is '-' or '_' ? character : '-');
        return new string(characters.ToArray());
    }

    private static string Encode(string text)
    {
        return WebUtility.HtmlEncode(text);
    }

    private static string Invariant(FormattableString text)
    {
        return text.ToString(CultureInfo.InvariantCulture);
    }
}
