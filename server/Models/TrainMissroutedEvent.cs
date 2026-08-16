using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainMissroutedEvent : TrainEventBase
    {
        public string ExpectedStation { get; set; } = string.Empty;
        public string ActualStation { get; set; } = string.Empty;

        public TrainMissroutedEvent(DateTime scheduledTime, string expectedStation, string actualStation) : base(scheduledTime)
        {
            ExpectedStation = expectedStation;
            ActualStation = actualStation;
        }
    }
}
