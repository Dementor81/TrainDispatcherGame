using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class NetworkConnectionDto
    {
        [JsonPropertyName("from")]
        public string FromStation { get; set; } = string.Empty;

        [JsonPropertyName("fromId")]
        public int FromExitId { get; set; }

        [JsonPropertyName("to")]
        public string ToStation { get; set; } = string.Empty;

        [JsonPropertyName("toId")]
        public int ToExitId { get; set; }

        [JsonPropertyName("distance")]
        public int Distance { get; set; }

        [JsonPropertyName("blocks")]
        public int Blocks { get; set; }

        [JsonPropertyName("mode")]
        public string Mode { get; set; } = string.Empty;
    }
}


