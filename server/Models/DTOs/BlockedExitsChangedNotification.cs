using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class BlockedExitsChangedNotification
    {
        [JsonPropertyName("stations")]
        public Dictionary<string, List<int>> Stations { get; set; } = new();
    }
}
