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
                    if (!string.IsNullOrWhiteSpace(player.StationId))
                    {
                        await Groups.RemoveFromGroupAsync(Context.ConnectionId, SessionStationGroup(session.SessionId, player.StationId));
                    }

                    if (string.IsNullOrWhiteSpace(player.StationId))
                    {
                        session.PlayerManager.DisconnectPlayer(player.Id);
                    }
                    else
                    {
                        // Capture state for the deferred teardown closure
                        var capturedSession = session;
                        var capturedPlayer = player;
                        var capturedStationId = player.StationId;
                        var capturedPlayerName = player.Name;

                        ServerLogger.Instance.LogDebug(Ctx(session.SessionId, player.Id), $"Player {player.Id} disconnected — grace period started ({GameSessionManager.PlayerTeardownGracePeriod.TotalSeconds}s)");

                        _sessionManager.SchedulePlayerTeardown(session.SessionId, player.Id, async () =>
                        {
                            ServerLogger.Instance.LogDebug(Ctx(capturedSession.SessionId, capturedPlayer.Id), $"Grace period expired for player {capturedPlayer.Id}, tearing down station {capturedStationId}");
                            if (!string.IsNullOrWhiteSpace(capturedStationId))
                            {
                                await capturedSession.Simulation.ReturnTrainsAtStation(capturedStationId);
                            }
                            capturedSession.PlayerManager.DisconnectPlayer(capturedPlayer.Id);
                            if (!string.IsNullOrWhiteSpace(capturedStationId))
                            {
                                await NotifyPlayerLeftSessionStation(capturedSession.SessionId, capturedPlayer.Id, capturedPlayerName, capturedStationId);
                            }
                        }, GameSessionManager.PlayerTeardownGracePeriod);
                    }
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

        public async Task<object> Join(string playerId, string gameCode = "", string playerName = "")
        {
            if (!GameSessionManager.TryNormalizeSessionId(gameCode, out var normalizedGameCode))
            {
                return new
                {
                    success = false,
                    errorCode = "invalid_game_code",
                    message = "Missing or invalid game code."
                };
            }

            if (!_sessionManager.TryGet(normalizedGameCode, out var session) || session == null)
            {
                return new
                {
                    success = false,
                    errorCode = "invalid_game_code",
                    message = "Invalid game code."
                };
            }

            if (string.IsNullOrWhiteSpace(playerId))
            {
                return new
                {
                    success = false,
                    errorCode = "missing_player_id",
                    message = "Missing player ID."
                };
            }

            var existingPlayer = session.PlayerManager.GetPlayer(playerId);
            var existingConnectionId = existingPlayer?.ConnectionId?.Trim() ?? string.Empty;
            var hasDifferentConnection = !string.IsNullOrWhiteSpace(existingConnectionId) &&
                !string.Equals(existingConnectionId, Context.ConnectionId, StringComparison.OrdinalIgnoreCase);

            if (hasDifferentConnection)
            {
                var inGracePeriod = _sessionManager.IsPlayerInTeardownGracePeriod(session.SessionId, playerId);
                var oldConnectionStillBound = _sessionManager.IsConnectionBoundToSession(existingConnectionId, session.SessionId);
                if (!inGracePeriod && oldConnectionStillBound)
                {
                    ServerLogger.Instance.LogWarning(
                        Ctx(session.SessionId, playerId),
                        $"Rejected duplicate join for player {playerId} from {Context.ConnectionId}; active connection is {existingConnectionId}");
                    return new
                    {
                        success = false,
                        errorCode = "already_connected",
                        message = "Du bist bereits in einem anderen Browser-Tab verbunden."
                    };
                }

                if (inGracePeriod)
                {
                    _sessionManager.CancelPlayerTeardown(session.SessionId, playerId);
                }

                if (oldConnectionStillBound)
                {
                    _sessionManager.UnbindConnection(existingConnectionId);
                }
            }

            session.PlayerManager.RegisterOrUpdatePlayer(playerId, Context.ConnectionId, playerName);
            _sessionManager.BindConnection(Context.ConnectionId, session.SessionId, playerId);
            await Groups.AddToGroupAsync(Context.ConnectionId, SessionGroup(session.SessionId));

            return new
            {
                success = true,
                sessionId = session.SessionId,
                playerId = playerId
            };
        }

        public async Task JoinStation(string stationId)
        {
            if (!TryResolveSession(out var session) || session == null)
            {
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = false,
                    message = "No active game session. Call Join first."
                });
                return;
            }

            var resolvedPlayerId = ResolvePlayerId();
            if (string.IsNullOrWhiteSpace(resolvedPlayerId))
            {
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = false,
                    message = "Could not resolve player for this connection. Call Join first."
                });
                return;
            }

            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(normalizedStationId))
            {
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = false,
                    message = "Missing station ID."
                });
                return;
            }

            // If the player is within the grace period, cancel teardown and fast-reconnect.
            if (_sessionManager.CancelPlayerTeardown(session.SessionId, resolvedPlayerId))
            {
                var existingPlayer = session.PlayerManager.GetPlayer(resolvedPlayerId);
                if (existingPlayer != null && string.Equals(existingPlayer.StationId, normalizedStationId, StringComparison.OrdinalIgnoreCase))
                {
                    session.PlayerManager.UpdateConnectionId(resolvedPlayerId, Context.ConnectionId);
                    _sessionManager.BindConnection(Context.ConnectionId, session.SessionId, resolvedPlayerId);
                    await Groups.AddToGroupAsync(Context.ConnectionId, SessionGroup(session.SessionId));
                    await Groups.AddToGroupAsync(Context.ConnectionId, SessionStationGroup(session.SessionId, normalizedStationId));
                    await session.NotificationManager.FlushStationBuffer(normalizedStationId, Context.ConnectionId);
                    await session.Simulation.Resume();
                    ServerLogger.Instance.LogDebug(Ctx(session.SessionId, resolvedPlayerId), $"Player {resolvedPlayerId} reconnected within grace period to station {normalizedStationId}");
                    await Clients.Caller.SendAsync("StationJoined", new
                    {
                        success = true,
                        isReconnect = true,
                        playerId = resolvedPlayerId,
                        stationId = normalizedStationId,
                        sessionId = session.SessionId,
                        playerName = existingPlayer.Name,
                        message = $"Reconnected to station {normalizedStationId}"
                    });
                    return;
                }
            }

            var success = session.PlayerManager.TakeControlOfStation(resolvedPlayerId, normalizedStationId, Context.ConnectionId);

            if (success)
            {
                _sessionManager.BindConnection(Context.ConnectionId, session.SessionId, resolvedPlayerId);
                await Groups.AddToGroupAsync(Context.ConnectionId, SessionGroup(session.SessionId));
                await Groups.AddToGroupAsync(Context.ConnectionId, SessionStationGroup(session.SessionId, normalizedStationId));
                var joinedPlayer = session.PlayerManager.GetPlayer(resolvedPlayerId);
                if (joinedPlayer != null)
                {
                    await NotifyPlayerJoinedSessionStation(session.SessionId, joinedPlayer);
                }
                await session.Simulation.Resume();

                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = true,
                    isReconnect = false,
                    playerId = resolvedPlayerId,
                    stationId = normalizedStationId,
                    sessionId = session.SessionId,
                    playerName = joinedPlayer?.Name ?? string.Empty,
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
            // Backward compatibility path for session-level clients (e.g. game master).
            if (!GameSessionManager.TryNormalizeSessionId(gameCode, out var normalizedGameCode))
            {
                await Clients.Caller.SendAsync("SessionJoined", new
                {
                    success = false,
                    message = "Missing or invalid game code."
                });
                return;
            }

            if (!_sessionManager.TryGet(normalizedGameCode, out var session) || session == null)
            {
                await Clients.Caller.SendAsync("SessionJoined", new
                {
                    success = false,
                    message = "Invalid game code."
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
            if (playerBeforeRelease == null || string.IsNullOrWhiteSpace(playerBeforeRelease.StationId))
            {
                await Clients.Caller.SendAsync("StationLeft", new
                {
                    success = true,
                    message = "No controlled station to leave"
                });
                return;
            }

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
                session.Simulation.NotifyTrainRemoved(train);
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