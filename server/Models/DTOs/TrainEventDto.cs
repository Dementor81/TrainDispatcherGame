using System;
using System.Collections.Generic;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrainEventDto
    {
        public string Type { get; set; } = string.Empty;
        public DateTime ScheduledTime { get; set; }
        public bool Processed { get; set; }
        public Dictionary<string, object?> Data { get; set; } = new();
    }
}
