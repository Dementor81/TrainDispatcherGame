using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Models;
using System.Linq;
using TrainDispatcherGame.Server.Logging;
using TrainDispatcherGame.Server.Sessions;

namespace TrainDispatcherGame.Server.Hubs
{
    public class GameHub : Hub
    {
        private readonly GameSessionManager _sessionManager;

        public GameHub(GameSessionManager sessionManager)
        {
            _sessionManager = sessionManager;
        }

        private static string SessionStationGroup(string sessionId, string stationId)
        {
            return $"session_{sessionId}_station_{stationId}";
        }

        private static string SessionGroup(string sessionId)
        {
            return $"session_{sessionId}";
        }

        private static string Ctx(string sessionId, string context)
        {
            return SessionLogContext.Prefix(sessionId, context);
        }

        private async Task NotifyPlayerJoinedSessionStation(string sessionId, Player player)
        {
            await Clients.Group(SessionGroup(sessionId)).SendAsync("PlayerJoinedStation", new
            {
                playerId = player.Id,
                playerName = player.Name,
                stationId = player.StationId
            });
        }

        private async Task NotifyPlayerLeftSessionStation(string sessionId, string playerId, string playerName, string stationId)
        {
            await Clients.Group(SessionGroup(sessionId)).SendAsync("PlayerLeftStation", new
            {
                playerId = playerId,
                playerName = playerName,
                stationId = stationId
            });
        }

        private string? ResolvePlayerId()
        {
            var mappedPlayerId = _sessionManager.GetPlayerIdForConnection(Context.ConnectionId);
            return mappedPlayerId;
        }

        private bool TryResolveSession(out GameSession? session)
        {
            if (_sessionManager.TryGetSessionForConnection(Context.ConnectionId, out session) && session != null)
            {
                return true;
            }

            ServerLogger.Instance.LogWarning(SessionLogContext.Prefix("default", Context.ConnectionId), $"No session bound to connection {Context.ConnectionId}");
            session = null;
            return false;
        }

        public override async Task OnConnectedAsync()
        {
            ServerLogger.Instance.LogDebug(SessionLogContext.Prefix("default", Context.ConnectionId), $"Client connected: {Context.ConnectionId}");
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var sessionId = _sessionManager.GetSessionIdForConnection(Context.ConnectionId);
            var playerId = _sessionManager.GetPlayerIdForConnection(Context.ConnectionId);
            GameSession? session = null;
            if (sessionId != null)
            {
                _sessionManager.TryGet(sessionId, out session);
            }

            if (session != null)
            {
                ServerLogger.Instance.LogDebug(Ctx(session.SessionId, Context.ConnectionId), $"Client disconnected: {Context.ConnectionId}");
                Player? player = null;
                if (!string.IsNullOrWhiteSpace(playerId))
                {
                    player = session.PlayerManager.GetPlayer(playerId);
                }

                player ??= session.PlayerManager.GetPlayerByConnectionId(Context.ConnectionId);
                if (player != null)
                {
                    var stationId = player.StationId;
                    var playerName = player.Name;
                    if (!string.IsNullOrWhiteSpace(player.StationId))
                    {
                        await session.Simulation.ReturnTrainsAtStation(player.StationId);
                        await Groups.RemoveFromGroupAsync(Context.ConnectionId, SessionStationGroup(session.SessionId, player.StationId));
                    }

                    session.PlayerManager.DisconnectPlayer(player.Id);
                    if (!string.IsNullOrWhiteSpace(stationId))
                    {
                        await NotifyPlayerLeftSessionStation(session.SessionId, player.Id, playerName, stationId);
                    }
                    ServerLogger.Instance.LogDebug(Ctx(session.SessionId, player.Id), $"Player {player.Id} disconnected from station {player.StationId}");
                }
            }

            if (!string.IsNullOrWhiteSpace(sessionId))
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, SessionGroup(sessionId));
            }

            _sessionManager.UnbindConnection(Context.ConnectionId);

            if (!string.IsNullOrWhiteSpace(sessionId) && session != null && _sessionManager.GetActiveConnectionCount(sessionId) == 0)
            {
                session.Simulation.Pause();
            }

            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinStation(string playerId, string stationId, string gameCode = "", string playerName = "")
        {
            // Normalize stationId to lowercase for consistent handling
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            if (!_sessionManager.TryGetOrCreateWithinLimit(gameCode, out var session) || session == null)
            {
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = false,
                    message = $"Cannot join game: maximum active sessions reached ({_sessionManager.MaxConcurrentSessions})."
                });
                return;
            }

            var success = session.PlayerManager.TakeControlOfStation(playerId, normalizedStationId, Context.ConnectionId, playerName);

            if (success)
            {
                _sessionManager.BindConnection(Context.ConnectionId, session.SessionId, playerId);
                await Groups.AddToGroupAsync(Context.ConnectionId, SessionGroup(session.SessionId));
                await Groups.AddToGroupAsync(Context.ConnectionId, SessionStationGroup(session.SessionId, normalizedStationId));
                var joinedPlayer = session.PlayerManager.GetPlayer(playerId);
                if (joinedPlayer != null)
                {
                    await NotifyPlayerJoinedSessionStation(session.SessionId, joinedPlayer);
                }

                // Send confirmation to the client
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = true,
                    playerId = playerId,
                    stationId = normalizedStationId,
                    sessionId = session.SessionId,
                    playerName = playerName,
                    message = $"Successfully joined station {normalizedStationId}"
                });
            }
            else
            {
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = false,
                    message = $"Failed to join station {normalizedStationId} - already controlled by another player"
                });
            }
        }

        public async Task JoinSession(string gameCode = "")
        {
            if (!_sessionManager.TryGetOrCreateWithinLimit(gameCode, out var session) || session == null)
            {
                await Clients.Caller.SendAsync("SessionJoined", new
                {
                    success = false,
                    message = $"Cannot join session: maximum active sessions reached ({_sessionManager.MaxConcurrentSessions})."
                });
                return;
            }

            _sessionManager.BindConnection(Context.ConnectionId, session.SessionId);
            await Groups.AddToGroupAsync(Context.ConnectionId, SessionGroup(session.SessionId));

            await Clients.Caller.SendAsync("SessionJoined", new
            {
                success = true,
                sessionId = session.SessionId
            });
        }

        public async Task LeaveStation()
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                await Clients.Caller.SendAsync("StationLeft", new
                {
                    success = false,
                    message = "No active game session"
                });
                return;
            }

            var resolvedPlayerId = ResolvePlayerId();
            if (string.IsNullOrWhiteSpace(resolvedPlayerId))
            {
                await Clients.Caller.SendAsync("StationLeft", new
                {
                    success = false,
                    message = "Could not resolve player for this connection"
                });
                return;
            }

            var playerBeforeRelease = session.PlayerManager.GetPlayer(resolvedPlayerId);
            var success = session.PlayerManager.ReleaseStation(resolvedPlayerId);

            if (success)
            {
                if (playerBeforeRelease != null && !string.IsNullOrWhiteSpace(playerBeforeRelease.StationId))
                {
                    await Groups.RemoveFromGroupAsync(Context.ConnectionId, SessionStationGroup(session.SessionId, playerBeforeRelease.StationId));
                }
                if (playerBeforeRelease != null && !string.IsNullOrWhiteSpace(playerBeforeRelease.StationId))
                {
                    await NotifyPlayerLeftSessionStation(session.SessionId, playerBeforeRelease.Id, playerBeforeRelease.Name, playerBeforeRelease.StationId);
                }

                await Clients.Caller.SendAsync("StationLeft", new
                {
                    success = true,
                    message = "Successfully left station"
                });
            }
            else
            {
                await Clients.Caller.SendAsync("StationLeft", new
                {
                    success = false,
                    message = "Failed to leave station"
                });
            }
        }

        public async Task GetStationStatus(string stationId)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            // Normalize stationId to lowercase for consistent handling
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            var isControlled = session.PlayerManager.IsStationControlled(normalizedStationId);
            var player = session.PlayerManager.GetPlayerByStation(normalizedStationId);
            
            await Clients.Caller.SendAsync("StationStatus", new
            {
                stationId = normalizedStationId,
                isControlled = isControlled,
                playerId = player?.Id
            });
        }

        public async Task Ping()
        {
            await Clients.Caller.SendAsync("Pong", DateTime.UtcNow);
        }

        public async Task ReceiveTrain(string trainNumber, int exitId)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            try
            {      
                // Find the existing train in simulation
                var train = session.Simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    ServerLogger.Instance.LogWarning(Ctx(session.SessionId, trainNumber), $"Failed to receive train {trainNumber}: Train not found in simulation");
                    return;
                }

                await session.Simulation.TrainReturnedFromClient(train, exitId);
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(session.SessionId, trainNumber), $"Error receiving train {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task ReportTrainStopped(string trainNumber, string stationId)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            try
            {
                // Find the existing train in simulation
                var train = session.Simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    ServerLogger.Instance.LogWarning(Ctx(session.SessionId, trainNumber), $"Failed to report train stopped {trainNumber}: Train not found in simulation");
                    return;
                }

                session.Simulation.ReportTrainStopped(train, stationId);
                
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(session.SessionId, trainNumber), $"Error reporting train stopped {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task ReportTrainDeparted(string trainNumber, string stationId)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            try
            {
                // Find the existing train in simulation
                var train = session.Simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    ServerLogger.Instance.LogWarning(Ctx(session.SessionId, trainNumber), $"Failed to report train departed {trainNumber}: Train not found in simulation");
                    return;
                }

                session.Simulation.ReportTrainDeparted(train, stationId); 
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(session.SessionId, trainNumber), $"Error reporting train departed {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task ReportTrainCollision(string trainNumberA, string trainNumberB, string stationId)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            try
            {
                var trainA = session.Simulation.Trains.FirstOrDefault(t => t.Number == trainNumberA);
                var trainB = session.Simulation.Trains.FirstOrDefault(t => t.Number == trainNumberB);
                if (trainA == null || trainB == null)
                {
                    ServerLogger.Instance.LogWarning(Ctx(session.SessionId, trainNumberA), $"Failed to report collision: One or both trains not found ({trainNumberA}, {trainNumberB})");
                    return;
                }

                session.Simulation.HandleCollision(trainA, trainB);
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(session.SessionId, trainNumberA), $"Error reporting train collision {trainNumberA} vs {trainNumberB}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task ReportTrainDerailed(string trainNumber, string stationId, int? switchId)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            try
            {
                var train = session.Simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    ServerLogger.Instance.LogWarning(Ctx(session.SessionId, trainNumber), $"Failed to report derailment: Train not found ({trainNumber})");
                    return;
                }

                session.Simulation.HandleDerailment(train, stationId, switchId);
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(session.SessionId, trainNumber), $"Error reporting train derailment {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task RespondApproval(string trainNumber, string fromStationId, bool approved)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            try
            {
                session.Simulation.ReceiveApproval(trainNumber, fromStationId, approved);
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(session.SessionId, trainNumber), $"Error processing approval response for train {trainNumber}: {ex.Message}");
            }
            await Task.CompletedTask;
        }

        public async Task TrainRemoved(string trainNumber, string stationId)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            try
            {
                var train = session.Simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    ServerLogger.Instance.LogWarning(Ctx(session.SessionId, trainNumber), $"Failed to mark train removed {trainNumber}: Train not found in simulation");
                    return;
                }

                train.completed = true;
                train.controlledByPlayer = false;
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(session.SessionId, trainNumber), $"Error processing TrainRemoved for train {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task SetExitBlockStatus(int exitId, bool blocked)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                return;
            }

            try
            {
                var resolvedPlayerId = ResolvePlayerId();
                if (string.IsNullOrWhiteSpace(resolvedPlayerId))
                {
                    ServerLogger.Instance.LogWarning(Ctx(session.SessionId, "unknown"), $"Unable to resolve player ID for exit block update on connection {Context.ConnectionId}");
                    return;
                }

                await session.Simulation.HandleExitBlockStatus(resolvedPlayerId, exitId, blocked);
            }
            catch (Exception ex)
            {
                ServerLogger.Instance.LogError(Ctx(session.SessionId, exitId.ToString()), $"Error setting exit block status for exit {exitId}: {ex.Message}");
            }
        }
    }
} 