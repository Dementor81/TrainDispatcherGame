using System.Collections.Generic;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Services;

namespace TrainDispatcherGame.Server.Simulation
{
    public class OpenLineTrackRegistry
    {
        private readonly TrackLayoutService _trackLayoutService;
        private Dictionary<NetworkConnection, OpenLineTrack> _openLineTracks = new();

        public OpenLineTrackRegistry(TrackLayoutService trackLayoutService)
        {
            _trackLayoutService = trackLayoutService;
        }

        public void Initialize()
        {
            _openLineTracks = new Dictionary<NetworkConnection, OpenLineTrack>();
            var connections = _trackLayoutService.GetAllConnections();
            foreach (var connection in connections)
            {
                if (connection.Mode == NetworkConnection.TrackMode.DualTrack || connection.Mode == NetworkConnection.TrackMode.SingleTrack)
                {
                    _openLineTracks[connection] = new OpenLineTrack(connection);
                }
            }
        }

        public bool TryGet(NetworkConnection connection, out OpenLineTrack track)
        {
            return _openLineTracks.TryGetValue(connection, out track!);
        }

        public bool AddTrain(NetworkConnection connection, Train train)
        {
            if (!_openLineTracks.TryGetValue(connection, out var track)) throw new Exception($"for connection {connection.FromStation} to {connection.ToStation} no open line track found");
            return track.AddTrain(train);
        }

        public void RemoveTrain(NetworkConnection connection)
        {
            if (!_openLineTracks.TryGetValue(connection, out var track)) throw new Exception($"for connection {connection.FromStation} to {connection.ToStation} no open line track found");
            track.RemoveTrain();
        }

        public IEnumerable<OpenLineTrack> GetAll()
        {
            return _openLineTracks.Values;
        }
    }
}


