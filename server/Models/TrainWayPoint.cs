using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainWayPoint
    {
        public string LocationId { get; set; } = string.Empty;
        public string Station { get; set; } = string.Empty;
        public DateTime ArrivalTime { get; set; }
        public DateTime DepartureTime { get; set; }
        public bool Processed { get; set; } = false;

        public bool Stops
        {
            get
            {
                return ArrivalTime != DepartureTime;
            }
        }

        public bool IsFake{
            get
            {
                return ArrivalTime == DateTime.MinValue && DepartureTime == DateTime.MinValue;
            }
        }
    }
}