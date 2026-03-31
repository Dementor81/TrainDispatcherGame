using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrainRemovedNotification
    {
        [JsonPropertyName("trainNumber")]
        public string TrainNumber { get; set; } = string.Empty;
    }
}
