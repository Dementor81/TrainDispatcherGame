using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum MajorEventType
    {
        MissedStop,
        Derailed,
        Collision,
        Removed
    }
}
