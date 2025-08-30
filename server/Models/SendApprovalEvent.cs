using System;

namespace TrainDispatcherGame.Server.Models
{
    public class SendApprovalEvent : TrainEventBase
    {
        public bool ApprovalSent { get; set; }

        public SendApprovalEvent(DateTime scheduledTime ) : base(scheduledTime)
        {
            ApprovalSent = false;
        }

        public void ApprovalDenied()
        {
            ScheduledTime = ScheduledTime.AddSeconds(60);
            ApprovalSent = false;
        }
    }
}


