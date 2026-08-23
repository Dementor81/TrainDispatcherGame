using System;
using System.Collections.Generic;

namespace TrainDispatcherGame.Server.Logging
{
    public class ServerLogger
    {
        public const int MaxEntries = 5000;

        private static readonly ServerLogger _instance = new ServerLogger();
        private readonly List<LogEntry> _entries = new List<LogEntry>();
        private readonly object _lock = new object();
        private Func<DateTime?>? _simulationTimeProvider;
        private long _nextId = 1;

        private ServerLogger()
        {
        }

        public static ServerLogger Instance => _instance;

        public void SetSimulationTimeProvider(Func<DateTime?> provider)
        {
            _simulationTimeProvider = provider;
        }

        public List<LogEntry> GetLogsAfter(string sessionPrefix, long afterId)
        {
            lock (_lock)
            {
                var logs = new List<LogEntry>();
                foreach (var entry in _entries)
                {
                    if (entry.Id <= afterId) continue;
                    if (!entry.Context.StartsWith(sessionPrefix, StringComparison.OrdinalIgnoreCase)) continue;
                    logs.Add(entry);
                }
                return logs;
            }
        }

        public void Clear()
        {
            lock (_lock)
            {
                _entries.Clear();
            }
        }

        public void ClearSession(string sessionId)
        {
            var prefix = SessionLogContext.SessionPrefix(sessionId);
            lock (_lock)
            {
                _entries.RemoveAll(entry =>
                    entry.Context.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
            }
        }

        public void LogDebug(string context, string message)
        {
            Log(LogLevel.Debug, context, message);
        }

        public void LogWarning(string context, string message)
        {
            Log(LogLevel.Warning, context, message);
        }

        public void LogError(string context, string message)
        {
            Log(LogLevel.Error, context, message);
        }

        public void LogEmergency(string context, string message)
        {
            Log(LogLevel.Emergency, context, message);
        }

        private void Log(LogLevel level, string context, string message)
        {
            var simulationTime = _simulationTimeProvider?.Invoke();
            lock (_lock)
            {
                _entries.Add(new LogEntry(_nextId++, DateTime.UtcNow, simulationTime, level, context, message));
                var overflow = _entries.Count - MaxEntries;
                if (overflow > 0)
                {
                    _entries.RemoveRange(0, overflow);
                }
            }
        }
    }
}
