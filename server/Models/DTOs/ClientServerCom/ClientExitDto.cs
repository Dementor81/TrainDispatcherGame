using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs.ClientServerCom
{
    public class ClientExitDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("destination")]
        public string Destination { get; set; } = string.Empty;
    }
}


