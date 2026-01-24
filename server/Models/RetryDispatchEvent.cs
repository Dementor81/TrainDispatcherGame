using System;

namespace TrainDispatcherGame.Server.Models
{
    public class RetryDispatchEvent : TrainEventBase
    {
        public RetryDispatchEvent(DateTime scheduledTime) : base(scheduledTime)
        {
        }
    }
}
