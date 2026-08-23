using System.Collections.Concurrent;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Hubs;
using TrainDispatcherGame.Server.Logging;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Simulation;

namespace TrainDispatcherGame.Server.Sessions
{
    public class GameSessionManager
    {
        private static readonly TimeSpan SessionInactivityTimeout = TimeSpan.FromMinutes(30);
        public static readonly TimeSpan PlayerTeardownGracePeriod = TimeSpan.FromSeconds(30);

        private readonly ConcurrentDictionary<string, GameSession> _sessions = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, DateTime> _reservedCodes = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, string> _connectionToSession = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, string> _connectionToPlayer = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, CancellationTokenSource> _pendingTeardowns = new(StringComparer.OrdinalIgnoreCase);
        private readonly IHubContext<GameHub> _hubContext;
        private readonly object _sessionCreateLock = new();
        private DateTime _lastCleanupUtc = DateTime.MinValue;
        private readonly object _cleanupLock = new();
        private readonly int _maxConcurrentSessions;
        private readonly bool _allowDevelopmentGameCode;

        public GameSessionManager(IHubContext<GameHub> hubContext, IConfiguration configuration, IWebHostEnvironment env)
        {
            _hubContext = hubContext;
            _maxConcurrentSessions = Math.Max(1, configuration.GetValue<int?>("GameSessions:MaxConcurrentSessions") ?? 20);
            _allowDevelopmentGameCode = env.IsDevelopment();
        }

        public int MaxConcurrentSessions => _maxConcurrentSessions;

        public int ActiveGameSessionCount
        {
            get
            {
                SweepInactiveSessionsIfNeeded();
                return _sessions.Count;
            }
        }

        public static bool TryNormalizeSessionId(string? sessionId, out string normalizedSessionId)
        {
            normalizedSessionId = sessionId?.Trim().ToLowerInvariant() ?? string.Empty;
            return !string.IsNullOrWhiteSpace(normalizedSessionId);
        }

        public static string NormalizeSessionId(string? sessionId)
        {
            if (!TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                throw new ArgumentException("Game code is required.", nameof(sessionId));
            }

            return normalizedSessionId;
        }

        public bool IsGameCodeInUse(string? sessionId)
        {
            SweepInactiveSessionsIfNeeded();
            if (!TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                return false;
            }

            return _sessions.ContainsKey(normalizedSessionId) || _reservedCodes.ContainsKey(normalizedSessionId);
        }

        public bool TryReserveGameCode(string? sessionId)
        {
            SweepInactiveSessionsIfNeeded();
            if (!TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                return false;
            }

            lock (_sessionCreateLock)
            {
                if (_sessions.ContainsKey(normalizedSessionId) || _reservedCodes.ContainsKey(normalizedSessionId))
                {
                    return false;
                }

                _reservedCodes[normalizedSessionId] = DateTime.UtcNow;
                return true;
            }
        }

        public SessionCreateStatus TryCreateSession(string? sessionId, string? scenarioId, out GameSession? session)
        {
            session = null;
            SweepInactiveSessionsIfNeeded();
            if (!TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                return SessionCreateStatus.NotReserved;
            }

            if (string.IsNullOrWhiteSpace(scenarioId) || ScenarioService.GetScenarioById(scenarioId) == null)
            {
                return SessionCreateStatus.InvalidScenario;
            }

            var chosenScenarioId = scenarioId.Trim();

            var isDevelopmentCode = _allowDevelopmentGameCode && IsDevelopmentGameCode(normalizedSessionId);

            lock (_sessionCreateLock)
            {
                if (_sessions.TryGetValue(normalizedSessionId, out var existing))
                {
                    if (!isDevelopmentCode)
                    {
                        existing.Touch();
                        session = existing;
                        return SessionCreateStatus.AlreadyExists;
                    }

                    DiscardSession(normalizedSessionId, existing);
                }

                if (!isDevelopmentCode && !_reservedCodes.ContainsKey(normalizedSessionId))
                {
                    return SessionCreateStatus.NotReserved;
                }

                if (_sessions.Count >= _maxConcurrentSessions)
                {
                    return SessionCreateStatus.AtCapacity;
                }

                session = CreateSession(normalizedSessionId, chosenScenarioId);
                _sessions[normalizedSessionId] = session;
                session.Touch();
                return SessionCreateStatus.Created;
            }
        }

        public bool TryGet(string? sessionId, out GameSession? session)
        {
            SweepInactiveSessionsIfNeeded();
            if (!TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                session = null;
                return false;
            }
            if (_sessions.TryGetValue(normalizedSessionId, out var existing))
            {
                existing.Touch();
                session = existing;
                return true;
            }

            session = null;
            return false;
        }

        public void BindConnection(string connectionId, string sessionId, string? playerId = null)
        {
            var normalizedSessionId = NormalizeSessionId(sessionId);
            _connectionToSession[connectionId] = normalizedSessionId;
            if (!string.IsNullOrWhiteSpace(playerId))
            {
                _connectionToPlayer[connectionId] = playerId;
            }
            else
            {
                _connectionToPlayer.TryRemove(connectionId, out _);
            }
            if (_sessions.TryGetValue(normalizedSessionId, out var session))
            {
                session.Touch();
            }
        }

        public bool TryGetSessionForConnection(string connectionId, out GameSession? session)
        {
            session = null;
            if (!_connectionToSession.TryGetValue(connectionId, out var sessionId))
            {
                return false;
            }

            if (!_sessions.TryGetValue(sessionId, out var existing))
            {
                return false;
            }

            existing.Touch();
            session = existing;
            return true;
        }

        public string? GetPlayerIdForConnection(string connectionId)
        {
            return _connectionToPlayer.TryGetValue(connectionId, out var playerId) ? playerId : null;
        }

        public string? GetSessionIdForConnection(string connectionId)
        {
            return _connectionToSession.TryGetValue(connectionId, out var sessionId) ? sessionId : null;
        }

        public bool IsConnectionBoundToSession(string connectionId, string? sessionId)
        {
            if (string.IsNullOrWhiteSpace(connectionId) || !TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                return false;
            }

            if (!_connectionToSession.TryGetValue(connectionId, out var mappedSessionId))
            {
                return false;
            }

            return string.Equals(mappedSessionId, normalizedSessionId, StringComparison.OrdinalIgnoreCase);
        }

        public int GetActiveConnectionCount(string? sessionId)
        {
            if (!TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                return 0;
            }

            return _connectionToSession.Values.Count(s => string.Equals(s, normalizedSessionId, StringComparison.OrdinalIgnoreCase));
        }

        public void UnbindConnection(string connectionId)
        {
            _connectionToPlayer.TryRemove(connectionId, out _);
            if (_connectionToSession.TryRemove(connectionId, out var sessionId) && _sessions.TryGetValue(sessionId, out var session))
            {
                session.Touch();
            }
        }

        public async Task<bool> TryEndSession(string? sessionId)
        {
            SweepInactiveSessionsIfNeeded();
            if (!TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                return false;
            }

            if (!_sessions.TryGetValue(normalizedSessionId, out var session) || session == null)
            {
                return false;
            }

            await _hubContext.Clients.Group($"session_{normalizedSessionId}").SendAsync("SessionEnded");

            foreach (var connectionId in _connectionToSession
                .Where(kvp => string.Equals(kvp.Value, normalizedSessionId, StringComparison.OrdinalIgnoreCase))
                .Select(kvp => kvp.Key)
                .ToArray())
            {
                UnbindConnection(connectionId);
            }

            var teardownPrefix = $"{normalizedSessionId}:";
            foreach (var key in _pendingTeardowns.Keys
                .Where(k => k.StartsWith(teardownPrefix, StringComparison.OrdinalIgnoreCase))
                .ToArray())
            {
                if (_pendingTeardowns.TryRemove(key, out var cts))
                {
                    cts.Cancel();
                    cts.Dispose();
                }
            }

            DiscardSession(normalizedSessionId, session);
            return true;
        }

        private static string TeardownKey(string sessionId, string playerId) => $"{sessionId}:{playerId}";

        public void SchedulePlayerTeardown(string sessionId, string playerId, Func<Task> action, TimeSpan delay)
        {
            var key = TeardownKey(sessionId, playerId);
            var cts = new CancellationTokenSource();
            _pendingTeardowns[key] = cts;

            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(delay, cts.Token);
                    if (!cts.Token.IsCancellationRequested)
                    {
                        _pendingTeardowns.TryRemove(key, out _);
                        await action();
                    }
                }
                catch (TaskCanceledException) { }
            });
        }

        public bool CancelPlayerTeardown(string sessionId, string playerId)
        {
            var key = TeardownKey(sessionId, playerId);
            if (_pendingTeardowns.TryRemove(key, out var cts))
            {
                cts.Cancel();
                cts.Dispose();
                return true;
            }
            return false;
        }

        public bool IsPlayerInTeardownGracePeriod(string sessionId, string playerId)
        {
            if (string.IsNullOrWhiteSpace(playerId) || !TryNormalizeSessionId(sessionId, out var normalizedSessionId))
            {
                return false;
            }

            return _pendingTeardowns.ContainsKey(TeardownKey(normalizedSessionId, playerId));
        }

        private static bool IsDevelopmentGameCode(string normalizedSessionId)
        {
            return string.Equals(normalizedSessionId, "dev101", StringComparison.OrdinalIgnoreCase);
        }

        private void DiscardSession(string sessionId, GameSession session)
        {
            session.Simulation.Stop();
            session.PlayerManager.ClearAllPlayers();
            ServerLogger.Instance.ClearSession(sessionId);
            _sessions.TryRemove(sessionId, out _);
        }

        private GameSession CreateSession(string sessionId, string scenarioId)
        {
            _reservedCodes.TryRemove(sessionId, out _);

            var playerManager = new PlayerManager();
            var notificationManager = new NotificationManager(_hubContext, playerManager, sessionId);

            // Let the notification manager buffer messages when the destination player is in grace period.
            notificationManager.SetGracePeriodChecker(stationId =>
            {
                var player = playerManager.GetPlayerByStation(stationId);
                return player != null && _pendingTeardowns.ContainsKey(TeardownKey(sessionId, player.Id));
            });

            var sessionTrackLayoutService = new TrackLayoutService();
            var simulation = new TrainDispatcherGame.Server.Simulation.Simulation(notificationManager, sessionTrackLayoutService, playerManager, scenarioId, sessionId);
            return new GameSession(sessionId, simulation, playerManager, notificationManager, sessionTrackLayoutService);
        }

        private void SweepInactiveSessionsIfNeeded()
        {
            var now = DateTime.UtcNow;
            if (now - _lastCleanupUtc < TimeSpan.FromMinutes(1))
            {
                return;
            }

            lock (_cleanupLock)
            {
                now = DateTime.UtcNow;
                if (now - _lastCleanupUtc < TimeSpan.FromMinutes(1))
                {
                    return;
                }

                foreach (var kvp in _sessions)
                {
                    var sessionId = kvp.Key;
                    var session = kvp.Value;
                    var hasConnections = _connectionToSession.Values.Any(s => string.Equals(s, sessionId, StringComparison.OrdinalIgnoreCase));
                    if (hasConnections)
                    {
                        continue;
                    }

                    if (now - session.LastAccessUtc <= SessionInactivityTimeout)
                    {
                        continue;
                    }

                    if (_sessions.TryGetValue(sessionId, out var removedSession))
                    {
                        DiscardSession(sessionId, removedSession);
                    }
                }

                foreach (var reservation in _reservedCodes)
                {
                    if (now - reservation.Value > SessionInactivityTimeout)
                    {
                        _reservedCodes.TryRemove(reservation.Key, out _);
                    }
                }

                _lastCleanupUtc = now;
            }
        }
    }
}
