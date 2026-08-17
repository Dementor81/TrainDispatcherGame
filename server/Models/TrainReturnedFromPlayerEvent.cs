using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainReturnedFromPlayerEvent : TrainEventBase
    {
        public string Station { get; set; } = string.Empty;
        public int? ExitPointId { get; set; }

        public TrainReturnedFromPlayerEvent(DateTime scheduledTime, string station, int? exitPointId = null) : base(scheduledTime)
        {
            Station = station;
            ExitPointId = exitPointId;
        }
    }
}
