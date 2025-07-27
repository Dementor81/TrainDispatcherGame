using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainSchedule
    {
        [JsonPropertyName("number")]
        public string Number { get; set; } = string.Empty;

        [JsonPropertyName("entries")]
        public List<ScheduleEntry> Entries { get; set; } = new();
    }
} 