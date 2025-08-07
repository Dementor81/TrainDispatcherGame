using System;
using System.Collections.Generic;
using System.Linq;

namespace TrainDispatcherGame.Server.Models
{
    public class Train
    {
        public string Number { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public int Speed { get; set; }
        public int Cars { get; set; }
        public List<string> Path { get; set; } = new();
        public TrainSpawn? Spawn { get; set; }
        public List<TrainEvent> Events { get; set; } = new();
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

        public TrainEvent? GetCurrentEvent()
        {
            if (CurrentEventIndex < Events.Count)
            {
                return Events[CurrentEventIndex];
            }
            return null;
        }

        public TrainEvent? GetNextEvent()
        {
            if (CurrentEventIndex + 1 < Events.Count)
            {
                return Events[CurrentEventIndex + 1];
            }
            return null;
        }

        public bool HasMoreEvents()
        {
            return CurrentEventIndex < Events.Count;
        }

        public List<TrainEvent> GetFutureEvents()
        {
            if (CurrentEventIndex >= Events.Count)
            {
                return new List<TrainEvent>();
            }
            
            return Events.Skip(CurrentEventIndex).ToList();
        }

        /// <summary>
        /// sets the counter to the next event and marks the current event as processed
        /// </summary>
        /// <param name="currentEvent">the current event to be processed</param>
        public TrainEvent? AdvanceToNextEvent()
        {
            if (HasMoreEvents())
            {
                CurrentEventIndex++; 
                return GetCurrentEvent();                
            }
            else
            {
                completed = true;
                return null;
            }
        }

        public void Reset()
        {
            throw new NotImplementedException();
        }

        

        

        
    }
} 