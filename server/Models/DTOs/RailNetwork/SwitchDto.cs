using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class SwitchDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("location")]
        public PointDto? Location { get; set; }

        [JsonPropertyName("tracks")]
        public List<int?> Tracks { get; set; } = new();
    }
}


