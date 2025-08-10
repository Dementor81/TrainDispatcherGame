using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class NetworkDto
    {
        [JsonPropertyName("connections")]
        public List<NetworkConnectionDto> Connections { get; set; } = new();
    }
}


