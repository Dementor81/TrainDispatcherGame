using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class PlatformDto
    {
        [JsonPropertyName("track")]
        public int Track { get; set; }

        // Note: "km" is used throughout the client as "distance along track" (pixel distance).
        [JsonPropertyName("from_km")]
        public double FromKm { get; set; }

        [JsonPropertyName("to_km")]
        public double ToKm { get; set; }
    }
}


