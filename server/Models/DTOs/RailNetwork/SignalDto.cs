using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class SignalDto
    {
        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("position")]
        public int? Position { get; set; }

        [JsonPropertyName("direction")]
        public int? Direction { get; set; }
    }
}


