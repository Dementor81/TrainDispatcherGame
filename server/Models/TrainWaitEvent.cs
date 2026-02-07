using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainWaitEvent : TrainEventBase
    {
        public TrainWaitEvent(DateTime scheduledTime) : base(scheduledTime)
        {
        }
    }
}
