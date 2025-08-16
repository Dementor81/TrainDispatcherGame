using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrackDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("start")]
        public PointDto? Start { get; set; }

        [JsonPropertyName("end")]
        public PointDto? End { get; set; }

        [JsonPropertyName("signals")]
        public List<SignalDto> Signals { get; set; } = new();

        [JsonPropertyName("switches")]
        public List<TrackSwitchRefDto> Switches { get; set; } = new();

        [JsonPropertyName("halt")]
        public bool? Halt { get; set; }
    }
}


