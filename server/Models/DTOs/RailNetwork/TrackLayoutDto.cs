using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrackLayoutDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("tracks")]
        public List<TrackDto> Tracks { get; set; } = new();

        [JsonPropertyName("switches")]
        public List<SwitchDto> Switches { get; set; } = new();

        [JsonPropertyName("platforms")]
        public List<PlatformDto> Platforms { get; set; } = new();
    }
}