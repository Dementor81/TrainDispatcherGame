using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class NetworkDto
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        [JsonPropertyName("stations")]
        public List<string> Stations { get; set; } = new();

        [JsonPropertyName("connections")]
        public List<NetworkConnectionDto> Connections { get; set; } = new();
    }
}


