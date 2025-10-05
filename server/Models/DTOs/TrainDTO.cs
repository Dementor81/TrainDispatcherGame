using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrainDTO
    {
        [JsonPropertyName("number")]
        public string Number { get; set; } = string.Empty;

        [JsonPropertyName("type")]
        public TrainDispatcherGame.Server.Models.TrainType Type { get; set; } = TrainDispatcherGame.Server.Models.TrainType.Passenger;

        [JsonPropertyName("category")]
        public string? Category { get; set; }

        [JsonPropertyName("speed")]
        public int Speed { get; set; }

        [JsonPropertyName("cars")]
        public int Cars { get; set; }

        [JsonPropertyName("path")]
        public List<string> Path { get; set; } = new();

        [JsonPropertyName("timetable")]
        public List<TimetableEntry> Timetable { get; set; } = new();
    }
} 