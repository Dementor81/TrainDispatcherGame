using System;

namespace TrainDispatcherGame.Server.Logging
{
    public class LogEntry
    {
        public LogEntry(DateTime timestamp, LogLevel level, string context, string message)
        {
            Timestamp = timestamp;
            Level = level;
            Context = context;
            Message = message;
        }

        public DateTime Timestamp { get; }
        public LogLevel Level { get; }
        public string Context { get; }
        public string Message { get; }
    }
}
