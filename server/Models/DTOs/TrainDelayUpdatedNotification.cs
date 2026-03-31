using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrainDelayUpdatedNotification
    {
        [JsonPropertyName("trainNumber")]
        public string TrainNumber { get; set; } = string.Empty;

        [JsonPropertyName("currentDelay")]
        public int CurrentDelay { get; set; }
    }
}
