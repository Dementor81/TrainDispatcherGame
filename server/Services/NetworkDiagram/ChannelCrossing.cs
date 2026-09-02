namespace TrainDispatcherGame.Server.Services.NetworkDiagram;

/// <summary>
/// One connection passing through one channel, the vertical corridor between
/// two columns. It arrives at <see cref="EntryY"/> and leaves at
/// <see cref="ExitY"/>; when those differ it needs a lane of its own so that no
/// two lines share the same vertical run.
/// </summary>
public class ChannelCrossing
{
    private const double Tolerance = 0.01;

    public ChannelCrossing(NetworkEdge edge, int channel, int step, int order)
    {
        Edge = edge;
        Channel = channel;
        Step = step;
        Order = order;
    }

    public NetworkEdge Edge { get; }

    public int Channel { get; }

    /// <summary>Position of this channel along the route of the connection.</summary>
    public int Step { get; }

    /// <summary>Creation order, used to keep the lane assignment stable.</summary>
    public int Order { get; }

    public double EntryY { get; init; }

    public double ExitY { get; init; }

    /// <summary>Whether the entry point sits on the column left of the channel.</summary>
    public bool EntryFromLeft { get; init; }

    public bool ExitFromLeft { get; init; }

    public int Lane { get; set; }

    public bool NeedsLane => Math.Abs(EntryY - ExitY) > Tolerance;

    public IEnumerable<double> LeftAttachYs => Attachments(true);

    public IEnumerable<double> RightAttachYs => Attachments(false);

    private IEnumerable<double> Attachments(bool fromLeft)
    {
        if (EntryFromLeft == fromLeft)
        {
            yield return EntryY;
        }

        if (ExitFromLeft == fromLeft)
        {
            yield return ExitY;
        }
    }
}
