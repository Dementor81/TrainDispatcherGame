using System;
using System.Collections.Generic;
using System.Linq;

namespace TrainDispatcherGame.Server.Models
{
    public class Train
    {
        public string Number { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public double Speed { get; set; }//m/s
        public int Cars { get; set; }
        public TrainEventBase? NextServerEvent { get; set; }
        public List<TrainWayPoint> Route { get; set; } = new();
        public int CurrentWaypointIndex { get; set; } = 0;
        public string? CurrentLocation { get; set; }
        public bool controlledByPlayer { get; set; } = false;
        public bool completed { get; set; } = false;
        public int delay { get; set; } = 0;

        public Train(string number)
        {
            Number = number;
        }

        public TrainWayPoint? GetWayPoint()
        {
            if (CurrentWaypointIndex < Route.Count)
            {
                return Route[CurrentWaypointIndex];
            }
            return null;
        }

        public TrainWayPoint? GetNextWayPoint()
        {
            if (CurrentWaypointIndex + 1 < Route.Count)
            {
                return Route[CurrentWaypointIndex + 1];
            }
            return null;
        }

        public bool HasMoreWayPoints()
        {
            return CurrentWaypointIndex < Route.Count;
        }

        public List<TrainWayPoint> GetFutureWayPoints()
        {
            if (CurrentWaypointIndex >= Route.Count)
            {
                return new List<TrainWayPoint>();
            }
            
            return Route.Skip(CurrentWaypointIndex).ToList();
        }

        /// <summary>
        /// sets the counter to the next event and marks the current event as processed
        /// </summary>
        /// <param name="currentEvent">the current event to be processed</param>
        public TrainWayPoint? AdvanceToNextWayPoint()
        {
            if (HasMoreWayPoints())
            {
                CurrentWaypointIndex++; 
                return GetWayPoint();                
            }
            else
            {
                completed = true;
                return null;
            }
        }

        public int GetTravelTime(int distance)
        {
            return (int)(distance / Speed);
        }

        public void Reset()
        {
            throw new NotImplementedException();
        }

        

        

        
    }
} 