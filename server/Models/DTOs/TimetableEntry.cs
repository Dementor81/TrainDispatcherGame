using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TimetableEntry
    {
        [JsonPropertyName("station")]
        public string Station { get; set; } = string.Empty;

        [JsonPropertyName("arrival")]
        public string Arrival { get; set; } = string.Empty;

        [JsonPropertyName("departure")]
        public string Departure { get; set; } = string.Empty;
    }
} 