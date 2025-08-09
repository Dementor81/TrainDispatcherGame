using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class StationTimetableEvent
    {
        [JsonPropertyName("trainNumber")]
        public string TrainNumber { get; set; } = string.Empty;

        [JsonPropertyName("arrival")]
        public string Arrival { get; set; } = string.Empty;

        [JsonPropertyName("departure")]
        public string Departure { get; set; } = string.Empty;

        [JsonPropertyName("currentDelay")]
        public int CurrentDelay { get; set; } = 0;

        [JsonPropertyName("fromStation")]
        public string FromStation { get; set; } = string.Empty;

        [JsonPropertyName("nextStation")]
        public string NextStation { get; set; } = string.Empty;
    }
}