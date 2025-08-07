using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrainSchedule
    {
        [JsonPropertyName("number")]
        public string Number { get; set; } = string.Empty;

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("speed")]
        public int Speed { get; set; }

        [JsonPropertyName("cars")]
        public int Cars { get; set; }

        [JsonPropertyName("path")]
        public List<string> Path { get; set; } = new();

        [JsonPropertyName("spawn")]
        public SpawnInfo Spawn { get; set; } = new();

        [JsonPropertyName("timetable")]
        public List<TimetableEntry> Timetable { get; set; } = new();
    }
} 