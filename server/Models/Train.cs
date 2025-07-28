using System;
using System.Collections.Generic;
using System.Linq;

namespace TrainDispatcherGame.Server.Models
{
    public class Train
    {
        public string Number { get; set; } = string.Empty;
        public List<TrainEvent> Events { get; set; } = new();
        public TrainState State { get; set; } = TrainState.Unspawned;
        public int CurrentEventIndex { get; set; } = 0;
        public string? CurrentLocation { get; set; }
        public bool controlledByPlayer { get; set; } = false;

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
            else
            {
                State = TrainState.Completed;
            }
        }

        public void Reset()
        {
            CurrentEventIndex = 0;
            State = TrainState.Unspawned;
            CurrentLocation = null;
            foreach (var evt in Events)
            {
                evt.Processed = false;
            }
        }

        public bool IsEventDue(DateTime currentTime)
        {
            var currentEvent = GetCurrentEvent();
            return currentEvent != null && currentEvent.ScheduledTime <= currentTime && !currentEvent.Processed;
        }

        public bool ShouldSpawn(DateTime currentTime)
        {
            var spawnEvent = GetSpawnEvent();
            return spawnEvent != null && spawnEvent.ScheduledTime <= currentTime && !spawnEvent.Processed;
        }

        public TrainEvent? GetSpawnEvent()
        {
            // Find the first event that represents the train spawning (usually the first event)
            return Events.FirstOrDefault(e => e.Type == "spawn");
        }
    }
} 