namespace TrainDispatcherGame.Server.Services.NetworkDiagram;

/// <summary>
/// Places the stations on a column and row grid. Columns come from the exit
/// numbering rule: a connection leaving on an odd exit puts its neighbour to
/// the right, an even exit puts it to the left. Connections that span more than
/// one column get a waypoint in every column they pass, so the routed line
/// always has a free row and can never run across a station box.
/// </summary>
public class NetworkLayout
{
    private const int MinBoxWidth = 130;
    private const int MinBoxHeight = 54;
    private const int WaypointColumnWidth = 70;
    private const double CharacterWidth = 9.5;
    private const int LabelPadding = 34;
    private const int PortPitch = 17;
    private const int RowGap = 48;
    private const int MinChannelWidth = 66;
    private const int ChannelPadding = 24;
    private const int LanePitch = 15;
    private const int ParallelTrackPitch = 15;
    private const int Margin = 40;
    private const int OrderingSweeps = 4;
    private const int RowSweeps = 3;
    private const int SeedOrders = 12;
    private const double CrossingPenalty = 4;

    private readonly NetworkGraph _graph;
    private readonly HashSet<StationNode> _connected = [];
    private readonly List<StationNode?> _nodeStation = [];
    private readonly List<int> _nodeColumn = [];
    private readonly List<int> _nodeRow = [];
    private readonly List<List<int>> _nodeNeighbours = [];
    private readonly Dictionary<NetworkEdge, List<int>> _edgeWaypoints = new();
    private double[] _channelStart = [];
    private double[] _channelWidth = [];
    private int[] _channelLanes = [];
    private int _columnCount;

    public NetworkLayout(NetworkGraph graph)
    {
        _graph = graph;
        foreach (var edge in graph.Edges)
        {
            _connected.Add(edge.From);
            _connected.Add(edge.To);
        }

        AssignColumns();
        BuildGrid();
        OrderRows();
        PlaceIsolatedStations();
        AssignVerticalGeometry();
    }

    public double Width { get; private set; }

    public double Height { get; private set; }

    public int ChannelCount => _columnCount + 1;

    /// <summary>
    /// Fixes the horizontal geometry once the router knows how many parallel
    /// lanes each channel between two columns has to carry.
    /// </summary>
    public void ApplyChannelLanes(IReadOnlyList<int> laneCounts)
    {
        _channelLanes = laneCounts.ToArray();
        var columnWidth = Enumerable.Repeat((double)WaypointColumnWidth, _columnCount).ToArray();

        foreach (var station in _graph.Stations)
        {
            station.Width = Math.Max(MinBoxWidth, station.Label.Length * CharacterWidth + LabelPadding);
            columnWidth[station.Column] = Math.Max(columnWidth[station.Column], station.Width);
        }

        _channelStart = new double[ChannelCount];
        _channelWidth = new double[ChannelCount];
        var columnStart = new double[_columnCount];
        var x = (double)Margin;

        for (var channel = 0; channel < ChannelCount; channel++)
        {
            _channelStart[channel] = x;
            _channelWidth[channel] = ChannelWidthFor(channel, _channelLanes[channel]);
            x += _channelWidth[channel];
            if (channel < _columnCount)
            {
                columnStart[channel] = x;
                x += columnWidth[channel];
            }
        }

        foreach (var station in _graph.Stations)
        {
            station.Left = columnStart[station.Column] + (columnWidth[station.Column] - station.Width) / 2;
        }

        Width = x + Margin;
    }

    /// <summary>X of one of the parallel vertical lanes inside a channel.</summary>
    public double LaneX(int channel, int lane)
    {
        var span = Math.Max(0, _channelLanes[channel] - 1) * LanePitch;
        return _channelStart[channel] + (_channelWidth[channel] - span) / 2 + lane * LanePitch;
    }

    private double ChannelWidthFor(int channel, int laneCount)
    {
        if (laneCount == 0 && (channel == 0 || channel == _columnCount))
        {
            return 0;
        }

        return Math.Max(MinChannelWidth, 2 * ChannelPadding + Math.Max(0, laneCount - 1) * LanePitch);
    }

    /// <summary>
    /// Longest path layering over the left and right constraints the exit
    /// numbers impose. A turn-back leaves both stations on the same side and so
    /// cannot order them; those stations are merged into a shared column
    /// whenever that stays consistent with the remaining constraints.
    /// </summary>
    private void AssignColumns()
    {
        var index = _graph.Stations
            .Select((station, position) => (station, position))
            .ToDictionary(pair => pair.station, pair => pair.position);
        var strict = new List<(int Left, int Right)>();
        var turnBacks = new List<(int First, int Second)>();

        foreach (var edge in _graph.Edges)
        {
            var from = index[edge.From];
            var to = index[edge.To];
            if (edge.IsTurnBack)
            {
                turnBacks.Add((from, to));
            }
            else if (edge.FromSide == ExitSide.Right)
            {
                strict.Add((from, to));
            }
            else
            {
                strict.Add((to, from));
            }
        }

        var merges = new List<(int First, int Second)>();
        foreach (var turnBack in turnBacks)
        {
            var candidate = merges.Append(turnBack).ToList();
            if (TryLayer(candidate, strict, index.Count, out _))
            {
                merges = candidate;
            }
        }

        TryLayer(merges, strict, index.Count, out var columns);
        foreach (var (station, position) in index)
        {
            station.Column = columns[position];
        }

        var placed = _graph.Stations.Where(_connected.Contains).ToList();
        if (placed.Count == 0)
        {
            return;
        }

        var offset = placed.Min(station => station.Column);
        foreach (var station in placed)
        {
            station.Column -= offset;
        }

        _columnCount = placed.Max(station => station.Column) + 1;
    }

    private static bool TryLayer(
        List<(int First, int Second)> merges,
        List<(int Left, int Right)> strict,
        int count,
        out int[] columns)
    {
        var parent = Enumerable.Range(0, count).ToArray();
        foreach (var (first, second) in merges)
        {
            Union(parent, first, second);
        }

        var group = Enumerable.Range(0, count).Select(node => Find(parent, node)).ToArray();
        var groupColumn = new int[count];
        var consistent = true;

        for (var iteration = 0; iteration <= count; iteration++)
        {
            var changed = false;
            foreach (var (left, right) in strict)
            {
                if (group[left] == group[right])
                {
                    consistent = false;
                    continue;
                }

                if (groupColumn[group[right]] <= groupColumn[group[left]])
                {
                    groupColumn[group[right]] = groupColumn[group[left]] + 1;
                    changed = true;
                }
            }

            if (!changed)
            {
                columns = group.Select(representative => groupColumn[representative]).ToArray();
                return consistent;
            }
        }

        columns = group.Select(representative => groupColumn[representative]).ToArray();
        return false;
    }

    private static int Find(int[] parent, int node)
    {
        while (parent[node] != node)
        {
            parent[node] = parent[parent[node]];
            node = parent[node];
        }

        return node;
    }

    private static void Union(int[] parent, int first, int second)
    {
        var rootFirst = Find(parent, first);
        var rootSecond = Find(parent, second);
        if (rootFirst != rootSecond)
        {
            parent[rootSecond] = rootFirst;
        }
    }

    /// <summary>
    /// Builds the node grid the row ordering works on: every station plus one
    /// waypoint per column a route has to cross on its way. Parallel tracks
    /// between the same two stations share those waypoints and are spread apart
    /// afterwards, so a double track stays a pair of parallel lines.
    /// </summary>
    private void BuildGrid()
    {
        var nodeOf = new Dictionary<StationNode, int>();
        foreach (var station in _graph.Stations.Where(_connected.Contains))
        {
            nodeOf[station] = AddNode(station, station.Column);
        }

        var routes = _graph.Edges
            .GroupBy(edge => (edge.Start, edge.End))
            .OrderBy(route => route.Key.Start.Id, StringComparer.Ordinal)
            .ThenBy(route => route.Key.End.Id, StringComparer.Ordinal);

        foreach (var route in routes)
        {
            var tracks = route.OrderBy(edge => edge.Start.PortIndex(edge.StartExitId)).ToList();
            var waypoints = new List<int>();
            for (var step = 0; step < tracks[0].EndChannel - tracks[0].StartChannel; step++)
            {
                waypoints.Add(AddNode(null, tracks[0].StartChannel + step));
            }

            for (var track = 0; track < tracks.Count; track++)
            {
                tracks[track].ParallelIndex = track;
                tracks[track].ParallelCount = tracks.Count;
                _edgeWaypoints[tracks[track]] = waypoints;
            }

            var chain = new List<int> { nodeOf[route.Key.Start] };
            chain.AddRange(waypoints);
            chain.Add(nodeOf[route.Key.End]);
            for (var step = 0; step + 1 < chain.Count; step++)
            {
                _nodeNeighbours[chain[step]].Add(chain[step + 1]);
                _nodeNeighbours[chain[step + 1]].Add(chain[step]);
            }
        }
    }

    private int AddNode(StationNode? station, int column)
    {
        _nodeStation.Add(station);
        _nodeColumn.Add(column);
        _nodeRow.Add(0);
        _nodeNeighbours.Add([]);
        return _nodeStation.Count - 1;
    }

    /// <summary>
    /// Orders the nodes of every column with median sweeps to cut crossings,
    /// then pulls each node towards the rows of its neighbours so that lines
    /// running through several columns stay straight. Which node ends up at the
    /// top of a column decides how much the lines have to climb, so several
    /// starting orders are tried and the straightest result wins.
    /// </summary>
    private void OrderRows()
    {
        var columns = new List<List<int>>();
        for (var column = 0; column < _columnCount; column++)
        {
            columns.Add([]);
        }

        for (var node = 0; node < _nodeStation.Count; node++)
        {
            columns[_nodeColumn[node]].Add(node);
        }

        var best = new List<int>(_nodeRow);
        var bestScore = double.MaxValue;

        foreach (var start in StartingOrders())
        {
            foreach (var column in columns)
            {
                column.Sort((first, second) => start[first].CompareTo(start[second]));
            }

            SetRowsFromOrder(columns);
            RunSweeps(columns);

            var score = Score(columns);
            if (score < bestScore)
            {
                bestScore = score;
                best = new List<int>(_nodeRow);
            }
        }

        for (var node = 0; node < _nodeRow.Count; node++)
        {
            _nodeRow[node] = best[node];
        }

        CompactRows();
        SeparateComponents(columns);
    }

    private void RunSweeps(List<List<int>> columns)
    {
        for (var sweep = 0; sweep < OrderingSweeps; sweep++)
        {
            for (var column = 1; column < columns.Count; column++)
            {
                SortByMedian(columns[column]);
                SetRowsFromOrder(columns);
            }

            for (var column = columns.Count - 2; column >= 0; column--)
            {
                SortByMedian(columns[column]);
                SetRowsFromOrder(columns);
            }
        }

        for (var sweep = 0; sweep < RowSweeps; sweep++)
        {
            foreach (var column in columns)
            {
                AlignRows(column);
            }

            for (var column = columns.Count - 1; column >= 0; column--)
            {
                AlignRows(columns[column]);
            }
        }
    }

    /// <summary>
    /// Candidate starting orders: alphabetical both ways, plus one per seed that
    /// follows the network from that station, which keeps a through route
    /// together instead of splitting it over several rows.
    /// </summary>
    private IEnumerable<int[]> StartingOrders()
    {
        var alphabetical = _nodeStation
            .Select((_, node) => node)
            .OrderBy(SortKey, StringComparer.Ordinal)
            .ToList();
        yield return Ranks(alphabetical);
        alphabetical.Reverse();
        yield return Ranks(alphabetical);

        var seeds = _nodeStation
            .Select((station, node) => (station, node))
            .Where(candidate => candidate.station != null)
            .OrderByDescending(candidate => _nodeNeighbours[candidate.node].Count)
            .ThenBy(candidate => candidate.station!.Id, StringComparer.Ordinal)
            .Select(candidate => candidate.node)
            .Take(SeedOrders);

        foreach (var seed in seeds)
        {
            yield return Ranks(DepthFirstOrder(seed));
        }
    }

    private int[] Ranks(IReadOnlyList<int> order)
    {
        var ranks = new int[_nodeStation.Count];
        for (var position = 0; position < order.Count; position++)
        {
            ranks[order[position]] = position;
        }

        return ranks;
    }

    private List<int> DepthFirstOrder(int seed)
    {
        var order = new List<int>();
        var visited = new HashSet<int>();
        var stack = new Stack<int>();
        stack.Push(seed);

        while (stack.TryPop(out var node))
        {
            if (!visited.Add(node))
            {
                continue;
            }

            order.Add(node);
            foreach (var neighbour in _nodeNeighbours[node]
                         .Distinct()
                         .OrderByDescending(SortKey, StringComparer.Ordinal))
            {
                stack.Push(neighbour);
            }
        }

        order.AddRange(_nodeStation
            .Select((_, node) => node)
            .Where(node => !visited.Contains(node))
            .OrderBy(SortKey, StringComparer.Ordinal));
        return order;
    }

    /// <summary>
    /// How far the lines have to travel vertically, plus a penalty per crossing.
    /// Lower is a tidier plan.
    /// </summary>
    private double Score(List<List<int>> columns)
    {
        var travel = 0.0;
        for (var node = 0; node < _nodeStation.Count; node++)
        {
            travel += _nodeNeighbours[node]
                .Where(neighbour => neighbour > node)
                .Sum(neighbour => Math.Abs(_nodeRow[node] - _nodeRow[neighbour]));
        }

        var crossings = 0;
        for (var column = 0; column + 1 < columns.Count; column++)
        {
            var segments = columns[column]
                .SelectMany(node => _nodeNeighbours[node]
                    .Where(neighbour => _nodeColumn[neighbour] == column + 1)
                    .Select(neighbour => (Left: _nodeRow[node], Right: _nodeRow[neighbour])))
                .OrderBy(segment => segment.Left)
                .ToList();

            for (var first = 0; first < segments.Count; first++)
            {
                for (var second = first + 1; second < segments.Count; second++)
                {
                    if (segments[first].Right > segments[second].Right)
                    {
                        crossings++;
                    }
                }
            }
        }

        return travel + CrossingPenalty * crossings;
    }

    private string SortKey(int node)
    {
        return _nodeStation[node]?.Id ?? $"~{node:D6}";
    }

    private void SetRowsFromOrder(List<List<int>> columns)
    {
        foreach (var column in columns)
        {
            for (var position = 0; position < column.Count; position++)
            {
                _nodeRow[column[position]] = position;
            }
        }
    }

    private void SortByMedian(List<int> column)
    {
        var keys = column.ToDictionary(node => node, node => MedianRow(node) ?? _nodeRow[node]);
        var order = column.ToDictionary(node => node, node => _nodeRow[node]);
        column.Sort((first, second) =>
        {
            var comparison = keys[first].CompareTo(keys[second]);
            return comparison != 0 ? comparison : order[first].CompareTo(order[second]);
        });
    }

    private double? MedianRow(int node)
    {
        var rows = _nodeNeighbours[node].Select(neighbour => _nodeRow[neighbour]).OrderBy(row => row).ToList();
        if (rows.Count == 0)
        {
            return null;
        }

        return rows.Count % 2 == 1
            ? rows[rows.Count / 2]
            : (rows[rows.Count / 2 - 1] + rows[rows.Count / 2]) / 2.0;
    }

    private void AlignRows(List<int> column)
    {
        var previous = int.MinValue;
        foreach (var node in column)
        {
            var desired = (int)Math.Round(MedianRow(node) ?? _nodeRow[node]);
            _nodeRow[node] = previous == int.MinValue ? desired : Math.Max(desired, previous + 1);
            previous = _nodeRow[node];
        }
    }

    /// <summary>Removes rows the alignment sweeps left empty.</summary>
    private void CompactRows()
    {
        var used = _nodeRow.Distinct().OrderBy(row => row).ToList();
        var compacted = used.Select((row, position) => (row, position)).ToDictionary(pair => pair.row, pair => pair.position);
        for (var node = 0; node < _nodeRow.Count; node++)
        {
            _nodeRow[node] = compacted[_nodeRow[node]];
        }
    }

    /// <summary>Stacks disconnected parts of the network instead of interleaving them.</summary>
    private void SeparateComponents(List<List<int>> columns)
    {
        var component = Enumerable.Repeat(-1, _nodeStation.Count).ToArray();
        var components = new List<List<int>>();

        for (var node = 0; node < _nodeStation.Count; node++)
        {
            if (component[node] >= 0)
            {
                continue;
            }

            var members = new List<int>();
            var queue = new Queue<int>();
            queue.Enqueue(node);
            component[node] = components.Count;
            while (queue.TryDequeue(out var current))
            {
                members.Add(current);
                foreach (var neighbour in _nodeNeighbours[current].Where(next => component[next] < 0))
                {
                    component[neighbour] = components.Count;
                    queue.Enqueue(neighbour);
                }
            }

            components.Add(members);
        }

        var top = 0;
        foreach (var members in components.OrderBy(members => members.Min(node => _nodeRow[node])))
        {
            var shift = top - members.Min(node => _nodeRow[node]);
            foreach (var node in members)
            {
                _nodeRow[node] += shift;
            }

            top = members.Max(node => _nodeRow[node]) + 2;
        }

        foreach (var column in columns)
        {
            column.Sort((first, second) => _nodeRow[first].CompareTo(_nodeRow[second]));
        }
    }

    /// <summary>Stations without any connection are listed in rows of their own.</summary>
    private void PlaceIsolatedStations()
    {
        var isolated = _graph.Stations.Where(station => !_connected.Contains(station)).ToList();
        if (isolated.Count == 0)
        {
            return;
        }

        var row = _nodeRow.Count == 0 ? 0 : _nodeRow.Max() + 2;
        var columns = Math.Max(1, _columnCount);
        for (var position = 0; position < isolated.Count; position++)
        {
            isolated[position].Column = position % columns;
            isolated[position].Row = row + position / columns;
        }

        _columnCount = Math.Max(_columnCount, Math.Min(isolated.Count, columns));
    }

    private void AssignVerticalGeometry()
    {
        var boxHeight = Math.Max(
            MinBoxHeight,
            PortPitch * (_graph.Stations.Select(station => station.PortCount).DefaultIfEmpty(0).Max() + 1));
        var rowPitch = boxHeight + RowGap;

        for (var node = 0; node < _nodeStation.Count; node++)
        {
            if (_nodeStation[node] is { } station)
            {
                station.Row = _nodeRow[node];
            }
        }

        foreach (var station in _graph.Stations)
        {
            station.Height = boxHeight;
            station.Top = Margin + station.Row * rowPitch;
        }

        foreach (var (edge, waypoints) in _edgeWaypoints)
        {
            var spread = (edge.ParallelIndex - (edge.ParallelCount - 1) / 2.0) * ParallelTrackPitch;
            edge.WaypointYs.Clear();
            edge.WaypointYs.AddRange(waypoints.Select(node =>
                Margin + _nodeRow[node] * rowPitch + boxHeight / 2.0 + spread));
        }

        var rows = _graph.Stations.Select(station => station.Row).Concat(_nodeRow).DefaultIfEmpty(0).Max();
        Height = Margin * 2 + (rows + 1) * rowPitch - RowGap;
    }
}
