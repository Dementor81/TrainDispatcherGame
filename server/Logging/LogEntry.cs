using System;

namespace TrainDispatcherGame.Server.Logging
{
    public class LogEntry
    {
        public LogEntry(DateTime timestamp, DateTime? simulationTime, LogLevel level, string context, string message)
        {
            Timestamp = timestamp;
            SimulationTime = simulationTime;
            Level = level;
            Context = context;
            Message = message;
        }

        public DateTime Timestamp { get; }
        public DateTime? SimulationTime { get; }
        public LogLevel Level { get; }
        public string Context { get; }
        public string Message { get; }
    }
}
