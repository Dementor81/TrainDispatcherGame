using System.Collections.Concurrent;
using Microsoft.Extensions.Configuration;
using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Hubs;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Services;
using TrainDispatcherGame.Server.Simulation;

namespace TrainDispatcherGame.Server.Sessions
{
    public class GameSessionManager
    {
        private static readonly TimeSpan SessionInactivityTimeout = TimeSpan.FromMinutes(30);

        private readonly ConcurrentDictionary<string, GameSession> _sessions = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, string> _connectionToSession = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, string> _connectionToPlayer = new(StringComparer.OrdinalIgnoreCase);
        private readonly IHubContext<GameHub> _hubContext;
        private readonly string _defaultScenarioId;
        private readonly object _sessionCreateLock = new();
        private DateTime _lastCleanupUtc = DateTime.MinValue;
        private readonly object _cleanupLock = new();
        private readonly int _maxConcurrentSessions;

        public GameSessionManager(IHubContext<GameHub> hubContext, IConfiguration configuration)
        {
            _hubContext = hubContext;
            _defaultScenarioId = ScenarioService.ListScenarios().Last().Id;
            _maxConcurrentSessions = Math.Max(1, configuration.GetValue<int?>("GameSessions:MaxConcurrentSessions") ?? 20);
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

        public GameSession GetOrCreate(string? sessionId)
        {
            SweepInactiveSessionsIfNeeded();
            var normalizedSessionId = NormalizeSessionId(sessionId);
            var session = _sessions.GetOrAdd(normalizedSessionId, CreateSession);
            session.Touch();
            return session;
        }

        public bool TryGetOrCreateWithinLimit(string? sessionId, out GameSession? session)
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

            lock (_sessionCreateLock)
            {
                if (_sessions.TryGetValue(normalizedSessionId, out existing))
                {
                    existing.Touch();
                    session = existing;
                    return true;
                }

                if (_sessions.Count >= _maxConcurrentSessions)
                {
                    session = null;
                    return false;
                }

                session = CreateSession(normalizedSessionId);
                _sessions[normalizedSessionId] = session;
                session.Touch();
                return true;
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

        private GameSession CreateSession(string sessionId)
        {
            var playerManager = new PlayerManager();
            var notificationManager = new NotificationManager(_hubContext, playerManager, sessionId);
            var sessionTrackLayoutService = new TrackLayoutService();
            var simulation = new TrainDispatcherGame.Server.Simulation.Simulation(notificationManager, sessionTrackLayoutService, playerManager, _defaultScenarioId, sessionId);
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

                    if (_sessions.TryRemove(sessionId, out var removedSession))
                    {
                        removedSession.Simulation.Stop();
                        removedSession.PlayerManager.ClearAllPlayers();
                    }
                }

                _lastCleanupUtc = now;
            }
        }
    }
}
