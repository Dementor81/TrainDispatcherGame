using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainCompletedEvent : TrainEventBase
    {
        public TrainCompletedEvent(DateTime scheduledTime) : base(scheduledTime)
        {
        }
    }
}
