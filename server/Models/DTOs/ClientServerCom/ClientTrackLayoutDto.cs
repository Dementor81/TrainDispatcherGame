using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs.ClientServerCom
{
    public class ClientTrackLayoutDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("exits")]
        public List<ClientExitDto> Exits { get; set; } = new();

        [JsonPropertyName("tracks")]
        public List<TrackDto> Tracks { get; set; } = new();

        [JsonPropertyName("switches")]
        public List<SwitchDto> Switches { get; set; } = new();
    }
}


