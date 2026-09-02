namespace TrainDispatcherGame.Server.Services.NetworkDiagram;

/// <summary>
/// One connection from network.json. The exit numbers decide which side of each
/// station the line leaves on, and therefore how the stations are ordered.
/// </summary>
public class NetworkEdge
{
    public NetworkEdge(StationNode from, int fromExitId, StationNode to, int toExitId)
    {
        From = from;
        FromExitId = fromExitId;
        To = to;
        ToExitId = toExitId;
    }

    public StationNode From { get; }

    public int FromExitId { get; }

    public StationNode To { get; }

    public int ToExitId { get; }

    public ExitSide FromSide => Side(FromExitId);

    public ExitSide ToSide => Side(ToExitId);

    /// <summary>
    /// A connection leaving both stations on the same side, where trains reverse
    /// their direction of travel. It is drawn as a bracket in the shared channel.
    /// </summary>
    public bool IsTurnBack => FromSide == ToSide;

    /// <summary>Vertical channels are numbered so that channel c lies left of column c.</summary>
    public int FromChannel => FromSide == ExitSide.Right ? From.Column + 1 : From.Column;

    public int ToChannel => ToSide == ExitSide.Right ? To.Column + 1 : To.Column;

    public int StartChannel => Math.Min(FromChannel, ToChannel);

    public int EndChannel => Math.Max(FromChannel, ToChannel);

    /// <summary>Routes are always built from the end that sits in the lower channel.</summary>
    public bool StartsAtFrom => FromChannel <= ToChannel;

    public StationNode Start => StartsAtFrom ? From : To;

    public int StartExitId => StartsAtFrom ? FromExitId : ToExitId;

    public ExitSide StartSide => StartsAtFrom ? FromSide : ToSide;

    public StationNode End => StartsAtFrom ? To : From;

    public int EndExitId => StartsAtFrom ? ToExitId : FromExitId;

    public ExitSide EndSide => StartsAtFrom ? ToSide : FromSide;

    /// <summary>Position of this track within the parallel tracks of its route.</summary>
    public int ParallelIndex { get; set; }

    public int ParallelCount { get; set; } = 1;

    /// <summary>Y of every waypoint between the two stations, ordered start to end.</summary>
    public List<double> WaypointYs { get; } = [];

    public List<(double X, double Y)> Points { get; } = [];

    private static ExitSide Side(int exitId)
    {
        return exitId % 2 != 0 ? ExitSide.Right : ExitSide.Left;
    }
}
