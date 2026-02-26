using Microsoft.AspNetCore.SignalR;
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

        public NotificationManager(IHubContext<GameHub> hubContext, PlayerManager playerManager, string sessionId)
        {
            _hubContext = hubContext;
            _playerManager = playerManager;
            _sessionId = sessionId;
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
            // Normalize stationId to lowercase for consistent handling
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            if (player != null)
            {
                // Get the current event for this train
                var currentEvent = train.GetCurrentWayPoint();
                if (currentEvent == null) throw new Exception($"Train {train.Number} has no current way point");
                TrainWayPointActionType action = currentEvent.Action;
                                
                // Prepare arrival and departure times
                DateTime arrivalTime = currentEvent.ArrivalTime;
                DateTime departureTime = currentEvent.DepartureTime;                
                await _hubContext.Clients.Group(SessionStationGroup(normalizedStationId)).SendAsync("TrainSent", new
                {
                    trainNumber = train.Number,
                    trainType = train.Type.ToString(),
                    stationId = normalizedStationId,
                    exitPointId = exitPointId,
                    action = action.ToString(),
                    arrivalTime = arrivalTime,
                    departureTime = departureTime,
                    cars = train.Cars,
                    speed = train.Speed,
                    followingTrainNumber = train.FollowingTrainNumber
                });
                
                ServerLogger.Instance.LogDebug(Ctx(train.Number), $"Sent train {train.Number} to player {player.Id} at station {normalizedStationId}, exit point {exitPointId}, action: {action}, arrival: {arrivalTime}, departure: {departureTime}");
            }
            else
            {
                ServerLogger.Instance.LogWarning(Ctx(normalizedStationId), $"No player found for station {normalizedStationId}");
            }
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
            // Normalize stationIds to lowercase for consistent handling
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            var normalizedFromStationId = fromStationId?.ToLowerInvariant() ?? string.Empty;
            
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            if (player != null)
            {
                await _hubContext.Clients.Group(SessionStationGroup(normalizedStationId)).SendAsync("ApprovalRequested", new
                {
                    stationId = normalizedStationId,
                    fromStationId = normalizedFromStationId,
                    trainNumber = trainNumber
                });
                ServerLogger.Instance.LogDebug(Ctx(trainNumber), $"Approval requested from station {normalizedStationId} for train {trainNumber} coming from {normalizedFromStationId}");
            }
            else
            {
                ServerLogger.Instance.LogWarning(Ctx(normalizedStationId), $"Approval request skipped: no player at station {normalizedStationId}");
            }
        }

        public async Task SendExitBlockStatus(string stationId, int exitId, bool blocked)
        {
            
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            if (player != null)
            {
                await _hubContext.Clients.Group(SessionStationGroup(normalizedStationId)).SendAsync("ExitBlockStatusChanged", new
                {
                    exitId = exitId,
                    blocked = blocked
                });
                ServerLogger.Instance.LogDebug(Ctx(normalizedStationId), $"Exit {exitId} at station {normalizedStationId} is now {(blocked ? "blocked" : "unblocked")}");
            }
        }

        
    }
} 