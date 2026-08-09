using System;

namespace TrainDispatcherGame.Server.Logging
{
    public class LogEntry
    {
        public LogEntry(long id, DateTime timestamp, DateTime? simulationTime, LogLevel level, string context, string message)
        {
            Id = id;
            Timestamp = timestamp;
            SimulationTime = simulationTime;
            Level = level;
            Context = context ?? string.Empty;
            Message = message ?? string.Empty;
        }

        public long Id { get; }
        public DateTime Timestamp { get; }
        public DateTime? SimulationTime { get; }
        public LogLevel Level { get; }
        public string Context { get; }
        public string Message { get; }
    }
}
