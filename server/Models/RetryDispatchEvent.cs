using System;

namespace TrainDispatcherGame.Server.Models
{
    public class RetryDispatchEvent : TrainEventBase
    {
        public string BlockingTrainNumber { get; set; } = string.Empty;

        public RetryDispatchEvent(DateTime scheduledTime, string blockingTrainNumber) : base(scheduledTime)
        {
            BlockingTrainNumber = blockingTrainNumber;
        }
    }
}
