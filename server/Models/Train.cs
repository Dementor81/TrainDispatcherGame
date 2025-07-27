using System;
using System.Collections.Generic;
using System.Linq;

namespace TrainDispatcherGame.Server.Models
{
    public class Train
    {
        public string Number { get; set; } = string.Empty;
        public List<TrainEvent> Events { get; set; } = new();
        public TrainState State { get; set; } = TrainState.Waiting;
        public int CurrentEventIndex { get; set; } = 0;
        public DateTime? SpawnTime { get; set; }
        public string? CurrentLocation { get; set; }

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

        public void AdvanceToNextEvent()
        {
            if (HasMoreEvents())
            {
                CurrentEventIndex++;
                if (CurrentEventIndex < Events.Count)
                {
                    CurrentLocation = Events[CurrentEventIndex].LocationId;
                }
            }
        }

        public void Reset()
        {
            CurrentEventIndex = 0;
            State = TrainState.Waiting;
            SpawnTime = null;
            CurrentLocation = Events.FirstOrDefault()?.LocationId;
        }

        public bool IsEventDue(DateTime currentTime)
        {
            var currentEvent = GetCurrentEvent();
            return currentEvent != null && currentEvent.ScheduledTime <= currentTime && !currentEvent.Processed;
        }
    }
} 