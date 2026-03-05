using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Hubs;
using TrainDispatcherGame.Server.Logging;

namespace TrainDispatcherGame.Server.Managers
{
    public class NotificationManager
    {
        private readonly IHubContext<GameHub> _hubContext;
        private readonly PlayerManager _playerManager;
        private readonly string _sessionId;

        // Keyed by normalised stationId; holds messages buffered while the player is in grace period.
        private readonly ConcurrentDictionary<string, ConcurrentQueue<(string Method, object Payload)>> _stationBuffer = new();
        private Func<string, bool>? _isInGracePeriod;

        public NotificationManager(IHubContext<GameHub> hubContext, PlayerManager playerManager, string sessionId)
        {
            _hubContext = hubContext;
            _playerManager = playerManager;
            _sessionId = sessionId;
        }

        /// <summary>
        /// Inject the grace-period checker so the manager can decide whether to buffer or send immediately.
        /// </summary>
        public void SetGracePeriodChecker(Func<string, bool> checker) => _isInGracePeriod = checker;

        private void BufferMessage(string stationId, string method, object payload)
        {
            var queue = _stationBuffer.GetOrAdd(stationId, _ => new ConcurrentQueue<(string, object)>());
            queue.Enqueue((method, payload));
        }

        /// <summary>
        /// Replays any buffered messages for the station directly to the reconnecting client connection.
        /// </summary>
        public async Task FlushStationBuffer(string stationId, string connectionId)
        {
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            if (!_stationBuffer.TryRemove(normalizedStationId, out var queue)) return;
            var messages = queue.ToArray();
            foreach (var (method, payload) in messages)
                await _hubContext.Clients.Client(connectionId).SendAsync(method, payload);
            if (messages.Length > 0)
                ServerLogger.Instance.LogDebug(Ctx(normalizedStationId), $"Flushed {messages.Length} buffered message(s) to {connectionId} for station {normalizedStationId}");
        }

        private string SessionStationGroup(string stationId)
        {
            return $"session_{_sessionId}_station_{stationId}";
        }

        private string SessionGroup()
        {
            return $"session_{_sessionId}";
        }

        private string Ctx(string context)
        {
            return SessionLogContext.Prefix(_sessionId, context);
        }

        public async Task SendTrain(string stationId, Train train, int? exitPointId = null)
        {
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            if (player == null)
            {
                ServerLogger.Instance.LogWarning(Ctx(normalizedStationId), $"No player found for station {normalizedStationId}");
                return;
            }

            var currentEvent = train.GetCurrentWayPoint();
            if (currentEvent == null) throw new Exception($"Train {train.Number} has no current way point");

            var payload = new
            {
                trainNumber = train.Number,
                category = train.Category,
                trainType = train.Type.ToString(),
                stationId = normalizedStationId,
                exitPointId = exitPointId,
                action = currentEvent.Action.ToString(),
                arrivalTime = currentEvent.ArrivalTime,
                departureTime = currentEvent.DepartureTime,
                cars = train.Cars,
                speed = train.Speed,
                followingTrainNumber = train.FollowingTrainNumber
            };

            if (_isInGracePeriod?.Invoke(normalizedStationId) == true)
            {
                BufferMessage(normalizedStationId, "TrainSent", payload);
                ServerLogger.Instance.LogDebug(Ctx(train.Number), $"Buffered TrainSent for train {train.Number} at station {normalizedStationId} (player in grace period)");
                return;
            }

            await _hubContext.Clients.Group(SessionStationGroup(normalizedStationId)).SendAsync("TrainSent", payload);
            ServerLogger.Instance.LogDebug(Ctx(train.Number), $"Sent train {train.Number} to player {player.Id} at station {normalizedStationId}, exit point {exitPointId}, action: {currentEvent.Action}, arrival: {currentEvent.ArrivalTime}, departure: {currentEvent.DepartureTime}");
        }

        public async Task SendSimulationStateChange(SimulationState newState, int speed)
        {
            await _hubContext.Clients.Group(SessionGroup()).SendAsync("SimulationStateChanged", new
            {
                state = newState.ToString(),
                timestamp = DateTime.UtcNow,
                speed = speed
            });
            
            ServerLogger.Instance.LogDebug(Ctx(newState.ToString()), $"Sent simulation state change to all clients in session {_sessionId}: {newState}");
        }

        public async Task SendApprovalRequest(string stationId, string fromStationId, string trainNumber)
        {
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            var normalizedFromStationId = fromStationId?.ToLowerInvariant() ?? string.Empty;
            
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            if (player == null)
            {
                ServerLogger.Instance.LogWarning(Ctx(normalizedStationId), $"Approval request skipped: no player at station {normalizedStationId}");
                return;
            }

            var payload = new
            {
                stationId = normalizedStationId,
                fromStationId = normalizedFromStationId,
                trainNumber = trainNumber
            };

            if (_isInGracePeriod?.Invoke(normalizedStationId) == true)
            {
                BufferMessage(normalizedStationId, "ApprovalRequested", payload);
                ServerLogger.Instance.LogDebug(Ctx(trainNumber), $"Buffered ApprovalRequested for train {trainNumber} at station {normalizedStationId} (player in grace period)");
                return;
            }

            await _hubContext.Clients.Group(SessionStationGroup(normalizedStationId)).SendAsync("ApprovalRequested", payload);
            ServerLogger.Instance.LogDebug(Ctx(trainNumber), $"Approval requested from station {normalizedStationId} for train {trainNumber} coming from {normalizedFromStationId}");
        }

        public async Task SendExitBlockStatus(string stationId, int exitId, bool blocked)
        {
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            if (player == null) return;

            var payload = new { exitId = exitId, blocked = blocked };

            if (_isInGracePeriod?.Invoke(normalizedStationId) == true)
            {
                BufferMessage(normalizedStationId, "ExitBlockStatusChanged", payload);
                ServerLogger.Instance.LogDebug(Ctx(normalizedStationId), $"Buffered ExitBlockStatusChanged exit {exitId} blocked={blocked} at station {normalizedStationId} (player in grace period)");
                return;
            }

            await _hubContext.Clients.Group(SessionStationGroup(normalizedStationId)).SendAsync("ExitBlockStatusChanged", payload);
            ServerLogger.Instance.LogDebug(Ctx(normalizedStationId), $"Exit {exitId} at station {normalizedStationId} is now {(blocked ? "blocked" : "unblocked")}");
        }

        
    }
} 