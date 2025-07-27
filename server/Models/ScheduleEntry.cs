using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models
{
    public class ScheduleEntry
    {
        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty; // "exit", "station", etc.

        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("time")]
        public string Time { get; set; } = string.Empty;

        [JsonPropertyName("stops")]
        public bool Stops { get; set; }
    }
} 