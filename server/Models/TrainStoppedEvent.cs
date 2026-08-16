using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainStoppedEvent : TrainEventBase
    {
        public string Station { get; set; } = string.Empty;
        public int Delay { get; set; }

        public TrainStoppedEvent(DateTime scheduledTime, string station, int delay) : base(scheduledTime)
        {
            Station = station;
            Delay = delay;
        }
    }
}
