using System;
using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models
{
    public class MajorEvent
    {
        [JsonPropertyName("simulationTime")]
        public DateTime SimulationTime { get; set; }

        [JsonPropertyName("type")]
        public MajorEventType Type { get; set; }

        [JsonPropertyName("trainNumber")]
        public string TrainNumber { get; set; } = string.Empty;

        [JsonPropertyName("otherTrainNumber")]
        public string? OtherTrainNumber { get; set; }

        [JsonPropertyName("station")]
        public string? Station { get; set; }

        [JsonPropertyName("playerName")]
        public string? PlayerName { get; set; }
    }
}
