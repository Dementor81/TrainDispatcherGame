using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainEvent
    {
        public string LocationId { get; set; } = string.Empty;
        public string Station { get; set; } = string.Empty;
        public DateTime ArrivalTime { get; set; }
        public DateTime DepartureTime { get; set; }
        public bool Processed { get; set; } = false;

        public bool Stops{
            get{
                return ArrivalTime != DepartureTime;
            }
        }     
    }
} 