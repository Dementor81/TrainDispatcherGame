using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainEvent
    {
        public string Type { get; set; } = string.Empty; // "exit", "station", etc.
        public string LocationId { get; set; } = string.Empty;
        public string Station { get; set; } = string.Empty;
        public DateTime ScheduledTime { get; set; }
        public bool Stops { get; set; }
        public bool Processed { get; set; } = false;
    }
} 