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
        public List<string> Path { get; set; } = new();
        public TrainSpawnPoint? Spawn { get; set; }
        public List<TrainWayPoint> Route { get; set; } = new();
        public int CurrentEventIndex { get; set; } = 0;
        public string? CurrentLocation { get; set; }
        public string? HeadingForStation { get; set; }
        public bool controlledByPlayer { get; set; } = false;
        public bool completed { get; set; } = false;
        public int delay { get; set; } = 0;

        public Train(string number)
        {
            Number = number;
        }

        public TrainWayPoint? GetWayPoint()
        {
            if (CurrentEventIndex < Route.Count)
            {
                return Route[CurrentEventIndex];
            }
            return null;
        }

        public TrainWayPoint? GetNextWayPoint()
        {
            if (CurrentEventIndex + 1 < Route.Count)
            {
                return Route[CurrentEventIndex + 1];
            }
            return null;
        }

        public bool HasMoreWayPoints()
        {
            return CurrentEventIndex < Route.Count;
        }

        public List<TrainWayPoint> GetFutureWayPoints()
        {
            if (CurrentEventIndex >= Route.Count)
            {
                return new List<TrainWayPoint>();
            }
            
            return Route.Skip(CurrentEventIndex).ToList();
        }

        /// <summary>
        /// sets the counter to the next event and marks the current event as processed
        /// </summary>
        /// <param name="currentEvent">the current event to be processed</param>
        public TrainWayPoint? AdvanceToNextWayPoint()
        {
            if (HasMoreWayPoints())
            {
                CurrentEventIndex++; 
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