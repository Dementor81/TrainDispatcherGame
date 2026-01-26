using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainWayPoint
    {
        public string Station { get; set; } = string.Empty;
        public DateTime ArrivalTime { get; set; }
        public DateTime DepartureTime { get; set; }
        public bool Processed { get; set; } = false;
        public bool IsLast { get; set; } = false;

        public TrainWayPoint(string station, DateTime arrivalTime, DateTime departureTime)
        {
            Station = station;
            ArrivalTime = arrivalTime;
            DepartureTime = departureTime;
        }

        public bool Stops
        {
            get
            {
                return ArrivalTime != DepartureTime;
            }
        }

        public TrainWayPointActionType Action
        {
            get
            {
                if (IsLast)
                    return TrainWayPointActionType.End;
                
                return Stops ? TrainWayPointActionType.Stop : TrainWayPointActionType.PassThrough;
            }
        }
    }
}