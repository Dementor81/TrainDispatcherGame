using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainSpawn
    {
        public DateTime ScheduledTime { get; set; }
        public bool Processed { get; set; }
        public string StationId { get; set; }
        public int ExitPointId { get; set; }

        public TrainSpawn(DateTime scheduledTime, string stationId, int exitPointId = -1)
        {
            ScheduledTime = scheduledTime;
            Processed = false;
            StationId = stationId;
            ExitPointId = exitPointId;
        }

        public bool IsDue(DateTime currentTime)
        {
            return ScheduledTime <= currentTime && !Processed;
        }
    }
} 