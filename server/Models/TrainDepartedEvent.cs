using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainDepartedEvent : TrainEventBase
    {
        public string Station { get; set; } = string.Empty;
        public int Delay { get; set; }

        public TrainDepartedEvent(DateTime scheduledTime, string station, int delay) : base(scheduledTime)
        {
            Station = station;
            Delay = delay;
        }
    }
}
