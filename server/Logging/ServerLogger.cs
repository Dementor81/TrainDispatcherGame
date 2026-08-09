using System;
using System.Collections.Generic;
using System.Linq;

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

        public IReadOnlyList<LogEntry> GetLogs()
        {
            lock (_lock)
            {
                return _entries.ToList();
            }
        }

        public IReadOnlyList<LogEntry> GetLogs(IEnumerable<string> contexts)
        {
            var allowedContexts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (contexts != null)
            {
                foreach (var context in contexts)
                {
                    if (!string.IsNullOrWhiteSpace(context))
                    {
                        allowedContexts.Add(context);
                    }
                }
            }

            lock (_lock)
            {
                if (allowedContexts.Count == 0)
                {
                    return _entries.ToList();
                }

                return _entries
                    .Where(entry => allowedContexts.Contains(entry.Context))
                    .ToList();
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
