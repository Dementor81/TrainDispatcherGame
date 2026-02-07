using System;
using System.Collections.Generic;
using System.Linq;

namespace TrainDispatcherGame.Server.Logging
{
    public class ServerLogger
    {
        private static readonly ServerLogger _instance = new ServerLogger();
        private readonly List<LogEntry> _entries = new List<LogEntry>();
        private readonly object _lock = new object();

        private ServerLogger()
        {
        }

        public static ServerLogger Instance => _instance;

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

        private void Log(LogLevel level, string context, string message)
        {
            var safeContext = context ?? string.Empty;
            var safeMessage = message ?? string.Empty;

            lock (_lock)
            {
                _entries.Add(new LogEntry(DateTime.UtcNow, level, safeContext, safeMessage));
            }
        }
    }
}
