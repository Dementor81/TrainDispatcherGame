using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainSpawnEvent : TrainEventBase
    {
        public string Station { get; set; }
        public int ExitPointId { get; set; }

        public TrainSpawnEvent(DateTime scheduledTime, string station, int exitPointId = -1) : base(scheduledTime)
        {
            Station = station;
            ExitPointId = exitPointId;
        }
    }
}