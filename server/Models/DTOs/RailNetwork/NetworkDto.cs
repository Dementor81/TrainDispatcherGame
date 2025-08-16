using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class NetworkDto
    {
        [JsonPropertyName("stations")]
        public List<string> Stations { get; set; } = new();

        [JsonPropertyName("connections")]
        public List<NetworkConnectionDto> Connections { get; set; } = new();
    }
}


