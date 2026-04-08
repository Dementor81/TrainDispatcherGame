using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class StationTimetableEvent
    {
        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        [JsonPropertyName("trainNumber")]
        public string TrainNumber { get; set; } = string.Empty;

        [JsonPropertyName("arrivalTime")]
        public DateTime? ArrivalTime { get; set; }

        [JsonPropertyName("departureTime")]
        public DateTime? DepartureTime { get; set; }

        [JsonPropertyName("currentDelay")]
        public int CurrentDelay { get; set; } = 0;

        [JsonPropertyName("fromStation")]
        public string FromStation { get; set; } = string.Empty;

        [JsonPropertyName("nextStation")]
        public string NextStation { get; set; } = string.Empty;
    }
}