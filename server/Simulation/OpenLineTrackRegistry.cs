using System.Collections.Generic;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Services;

namespace TrainDispatcherGame.Server.Simulation
{
    public class OpenLineTrackRegistry
    {
        private readonly ITrackLayoutService _trackLayoutService;
        private Dictionary<NetworkConnection, OpenLineTrack> _openLineTracks = new();

        public OpenLineTrackRegistry(ITrackLayoutService trackLayoutService)
        {
            _trackLayoutService = trackLayoutService;
        }

        public void Initialize()
        {
            _openLineTracks = new Dictionary<NetworkConnection, OpenLineTrack>();
            var connections = _trackLayoutService.GetAllConnections();
            foreach (var connection in connections)
            {
                if (connection.Mode == NetworkConnection.TrackMode.Regular || connection.Mode == NetworkConnection.TrackMode.SingleTrack)
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
            if (!_openLineTracks.TryGetValue(connection, out var track)) return false;
            return track.AddTrain(train);
        }

        public void RemoveTrain(NetworkConnection connection, Train train)
        {
            if (_openLineTracks.TryGetValue(connection, out var track))
            {
                track.RemoveTrain(train);
            }
        }
    }
}


