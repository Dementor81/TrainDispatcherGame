using System.Text.Json.Serialization;

namespace TrainDispatcherGame.Server.Models
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum TrainType
    {
        Passenger,
        Freight
    }
}


