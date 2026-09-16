using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainWayPoint
    {
        public string Station { get; set; } = string.Empty;
        public DateTime ArrivalTime { get; set; }
        public DateTime DepartureTime { get; set; }
        public DateTime ActualArrivalTime { get; set; } = DateTime.MinValue;
        public DateTime ActualDepartureTime { get; set; } = DateTime.MinValue;
        public bool Processed { get; set; } = false;
        public bool IsLast { get; set; } = false;

        public TrainWayPoint(string station, DateTime arrivalTime, DateTime departureTime)
        {
            Station = station;
            ArrivalTime = arrivalTime;
            DepartureTime = departureTime;
        }

        public static bool HasTime(DateTime time) => time.Year > 1;
        public bool HasArrivalTime => HasTime(ArrivalTime);
        public bool HasDepartureTime => HasTime(DepartureTime);
        public bool HasActualArrivalTime => HasTime(ActualArrivalTime);
        public bool HasActualDepartureTime => HasTime(ActualDepartureTime);
        public DateTime ScheduledReferenceTime => HasArrivalTime ? ArrivalTime : DepartureTime;

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