using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainMissedStopEvent : TrainEventBase
    {
        public string Station { get; set; } = string.Empty;

        public TrainMissedStopEvent(DateTime scheduledTime, string station) : base(scheduledTime)
        {
            Station = station;
        }
    }
}
