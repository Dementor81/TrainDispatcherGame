namespace TrainDispatcherGame.Server.Services.NetworkDiagram;

/// <summary>
/// Draws every connection as a right-angled line: it leaves its station
/// horizontally at the port of its exit, drops into a free vertical lane of the
/// channel between two columns, and enters the next port horizontally again.
/// A turn-back leaves and re-enters on the same side and becomes a bracket.
/// </summary>
public class OrthogonalRouter
{
    private const double Tolerance = 0.01;

    private readonly NetworkGraph _graph;
    private readonly NetworkLayout _layout;

    public OrthogonalRouter(NetworkGraph graph, NetworkLayout layout)
    {
        _graph = graph;
        _layout = layout;
    }

    public void Route()
    {
        var crossings = Collect();
        var laneCounts = new int[_layout.ChannelCount];
        foreach (var channel in crossings.GroupBy(crossing => crossing.Channel))
        {
            laneCounts[channel.Key] = AssignLanes(channel.ToList());
        }

        _layout.ApplyChannelLanes(laneCounts);

        var byEdge = crossings.GroupBy(crossing => crossing.Edge).ToDictionary(group => group.Key, group => group.ToList());
        foreach (var edge in _graph.Edges)
        {
            BuildPath(edge, byEdge[edge]);
        }
    }

    private List<ChannelCrossing> Collect()
    {
        var crossings = new List<ChannelCrossing>();
        foreach (var edge in _graph.Edges)
        {
            var heights = new List<double> { edge.Start.PortY(edge.StartExitId) };
            heights.AddRange(edge.WaypointYs);
            heights.Add(edge.End.PortY(edge.EndExitId));
            var last = heights.Count - 2;

            for (var step = 0; step <= last; step++)
            {
                crossings.Add(new ChannelCrossing(edge, edge.StartChannel + step, step, crossings.Count)
                {
                    EntryY = heights[step],
                    ExitY = heights[step + 1],
                    EntryFromLeft = step > 0 || edge.StartSide == ExitSide.Right,
                    ExitFromLeft = step == last && edge.EndSide == ExitSide.Right,
                });
            }
        }

        return crossings;
    }

    /// <summary>
    /// Gives every vertical run in a channel its own lane. A line that reaches
    /// the channel from the left has to stay left of a line that leaves it to
    /// the right at the same height, otherwise the two horizontal stubs would
    /// run on top of each other.
    /// </summary>
    private static int AssignLanes(List<ChannelCrossing> crossings)
    {
        var lanes = crossings.Where(crossing => crossing.NeedsLane).ToList();
        var blockedBy = lanes.ToDictionary(crossing => crossing, _ => new List<ChannelCrossing>());

        foreach (var outgoing in lanes)
        {
            foreach (var incoming in lanes.Where(candidate => !ReferenceEquals(candidate, outgoing)))
            {
                if (incoming.LeftAttachYs.Any(height =>
                        outgoing.RightAttachYs.Any(other => Math.Abs(height - other) < Tolerance)))
                {
                    blockedBy[outgoing].Add(incoming);
                }
            }
        }

        var lane = 0;
        var remaining = lanes.ToList();
        while (remaining.Count > 0)
        {
            var ready = remaining
                .Where(crossing => blockedBy[crossing].All(blocker => !remaining.Contains(blocker)))
                .ToList();
            var next = (ready.Count > 0 ? ready : remaining)
                .OrderBy(crossing => Math.Min(crossing.EntryY, crossing.ExitY))
                .ThenBy(crossing => crossing.Order)
                .First();
            next.Lane = lane++;
            remaining.Remove(next);
        }

        return lanes.Count;
    }

    private void BuildPath(NetworkEdge edge, List<ChannelCrossing> crossings)
    {
        var points = new List<(double X, double Y)>
        {
            (edge.Start.PortX(edge.StartSide), edge.Start.PortY(edge.StartExitId)),
        };

        foreach (var crossing in crossings.OrderBy(crossing => crossing.Step).Where(crossing => crossing.NeedsLane))
        {
            var x = _layout.LaneX(crossing.Channel, crossing.Lane);
            points.Add((x, crossing.EntryY));
            points.Add((x, crossing.ExitY));
        }

        points.Add((edge.End.PortX(edge.EndSide), edge.End.PortY(edge.EndExitId)));

        edge.Points.Clear();
        edge.Points.AddRange(Simplify(points));
    }

    private static List<(double X, double Y)> Simplify(List<(double X, double Y)> points)
    {
        var simplified = new List<(double X, double Y)>();
        foreach (var point in points)
        {
            if (simplified.Count > 0 && Same(simplified[^1], point))
            {
                continue;
            }

            simplified.Add(point);
        }

        for (var index = simplified.Count - 2; index > 0; index--)
        {
            var previous = simplified[index - 1];
            var current = simplified[index];
            var next = simplified[index + 1];
            var straight =
                Math.Abs(previous.X - current.X) < Tolerance && Math.Abs(current.X - next.X) < Tolerance ||
                Math.Abs(previous.Y - current.Y) < Tolerance && Math.Abs(current.Y - next.Y) < Tolerance;
            if (straight)
            {
                simplified.RemoveAt(index);
            }
        }

        return simplified;
    }

    private static bool Same((double X, double Y) first, (double X, double Y) second)
    {
        return Math.Abs(first.X - second.X) < Tolerance && Math.Abs(first.Y - second.Y) < Tolerance;
    }
}
