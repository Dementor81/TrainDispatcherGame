using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainHandedToPlayerEvent : TrainEventBase
    {
        public string Station { get; set; } = string.Empty;
        public int? ExitPointId { get; set; }

        public TrainHandedToPlayerEvent(DateTime scheduledTime, string station, int? exitPointId = null) : base(scheduledTime)
        {
            Station = station;
            ExitPointId = exitPointId;
        }
    }
}
