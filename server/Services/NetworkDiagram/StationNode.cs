namespace TrainDispatcherGame.Server.Services.NetworkDiagram;

/// <summary>
/// A station box in the diagram. The exits used by its connections become
/// ports on the left or right edge, ordered by exit number from the top down.
/// </summary>
public class StationNode
{
    private readonly List<int> _leftExits = [];
    private readonly List<int> _rightExits = [];

    public StationNode(string id, string label, bool isExternal)
    {
        Id = id;
        Label = label;
        IsExternal = isExternal;
    }

    public string Id { get; }

    public string Label { get; }

    /// <summary>A station without a track layout, only referenced by a connection.</summary>
    public bool IsExternal { get; }

    public int Column { get; set; }

    public int Row { get; set; }

    public double Left { get; set; }

    public double Top { get; set; }

    public double Width { get; set; }

    public double Height { get; set; }

    public double Right => Left + Width;

    public double CenterX => Left + Width / 2;

    public double CenterY => Top + Height / 2;

    public int PortCount => Math.Max(_leftExits.Count, _rightExits.Count);

    public void AddExit(int exitId)
    {
        var ports = Ports(exitId);
        if (ports.Contains(exitId))
        {
            return;
        }

        var index = ports.FindIndex(existing => existing > exitId);
        ports.Insert(index < 0 ? ports.Count : index, exitId);
    }

    /// <summary>Position of an exit on its side of the box, counted from the top.</summary>
    public int PortIndex(int exitId)
    {
        return Ports(exitId).IndexOf(exitId);
    }

    /// <summary>The Y of an exit on its box edge, following the top-down exit order.</summary>
    public double PortY(int exitId)
    {
        var ports = Ports(exitId);
        return Top + Height * (PortIndex(exitId) + 1) / (ports.Count + 1);
    }

    public double PortX(ExitSide side)
    {
        return side == ExitSide.Right ? Right : Left;
    }

    private List<int> Ports(int exitId)
    {
        return exitId % 2 != 0 ? _rightExits : _leftExits;
    }
}
