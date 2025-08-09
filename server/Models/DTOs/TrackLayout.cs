using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrackLayout
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("exits")]
        public List<ExitPoint> Exits { get; set; } = new();

        // Computed when loading the JSON in TrackLayoutService; not part of persisted JSON
        [JsonIgnore]
        public double MaxExitDistance { get; set; }
    }

    public class ExitPoint
    {
        [JsonPropertyName("destination")]
        public string Destination { get; set; } = string.Empty;

        [JsonPropertyName("id")]
        public int Id { get; set; }
    }
} 