using System.Collections.Generic;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Logging;

namespace TrainDispatcherGame.Server.Simulation
{
    public class OpenLineTrackRegistry
    {
        private readonly TrackLayoutService _trackLayoutService;
        private readonly string _sessionId;
        private Dictionary<NetworkConnection, OpenLineTrack> _openLineTracks = new();

        public OpenLineTrackRegistry(TrackLayoutService trackLayoutService, string sessionId)
        {
            _trackLayoutService = trackLayoutService;
            _sessionId = sessionId;
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

        public bool AddTrain(NetworkConnection connection, Train train, out List<NetworkConnection> releasedStale)
        {
            releasedStale = new List<NetworkConnection>();
            if (!_openLineTracks.TryGetValue(connection, out var track)) return false;

            foreach (var otherTrack in _openLineTracks.Values)
            {
                if (otherTrack == track) continue;
                if (otherTrack.TrainOnTrack != train) continue;

                ServerLogger.Instance.LogWarning(
                    SessionLogContext.Prefix(_sessionId, train.Number),
                    $"Safety cleanup: train {train.Number} was still registered on {otherTrack.Connection.FromStation}->{otherTrack.Connection.ToStation} while adding it to {connection.FromStation}->{connection.ToStation}. Removing stale registration.");
                otherTrack.RemoveTrain();
                releasedStale.Add(otherTrack.Connection);
            }

            return track.AddTrain(train);
        }

        public bool RemoveTrain(NetworkConnection connection)
        {
            if (!_openLineTracks.TryGetValue(connection, out var track)) return false;
            track.RemoveTrain();
            return true;
        }

        public IEnumerable<OpenLineTrack> GetAll()
        {
            return _openLineTracks.Values;
        }

        /// <summary>
        /// Remove a train from all open line tracks and clear it from waiting slots.
        /// Returns connections whose occupancy was released.
        /// </summary>
        public List<NetworkConnection> ReleaseTrain(Train train)
        {
            var released = new List<NetworkConnection>();
            foreach (var track in _openLineTracks.Values)
            {
                if (track.TrainOnTrack == train)
                {
                    track.RemoveTrain();
                    released.Add(track.Connection);
                }
                if (track.WaitingTrainNumber == train.Number)
                {
                    track.WaitingTrainNumber = null;
                }
            }
            return released;
        }

        public void RemoveTrainFromAllTracks(Train train)
        {
            ReleaseTrain(train);
        }
    }
}
