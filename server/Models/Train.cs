using System;
using System.Collections.Generic;
using System.Linq;

namespace TrainDispatcherGame.Server.Models
{
    public class Train
    {
        public string Number { get; set; } = string.Empty;
        public TrainType Type { get; set; } = TrainType.Passenger;
        public bool Passengers { get; set; } = true;
        public string? Category { get; set; } = null;
        public double SpeedMax { get; set; }//m/s
        public int Cars { get; set; }
        private TrainEventBase? _trainEvent;
        public TrainEventBase? TrainEvent
        {
            get => _trainEvent;
            set
            {
                if (_trainEvent != null && !_trainEvent.Processed)
                    _trainEvent.Processed = true;
                if (value != null)
                    Events.Add(value);
                _trainEvent = value;
            }
        }
        public List<TrainEventBase> Events { get; } = new();
        public List<TrainWayPoint> Route { get; set; } = new();
        public int CurrentWaypointIndex { get; set; } = 0;
        public string? CurrentLocation { get; set; }
        public bool controlledByPlayer { get; set; } = false;
        public bool completed { get; set; } = false;
        // Seconds late (positive) or early (negative) vs schedule.
        public int delay { get; set; } = 0;
        public bool damaged { get; set; } = false;
        // Manual remove by a player (not a normal finish or accident).
        public bool removed { get; set; } = false;
        // If true, this train is skipped by the server event loop after being retired.
        public bool updateFailed { get; set; } = false;
        public int updateFailCount { get; set; } = 0;
        public string? PredecessorTrainNumber { get; set; }
        public string? FollowingTrainNumber { get; set; }

        public Train(string number)
        {
            Number = number;
        }

        public TrainWayPoint? GetPreviousWayPoint()
        {
            if (CurrentWaypointIndex > 0)
            {
                return Route[CurrentWaypointIndex - 1];
            }
            return null;
        }

        public TrainWayPoint? GetCurrentWayPoint()
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
                return GetCurrentWayPoint();                
            }
            else
            {
                
                return null;
            }
        }

        public int GetTravelTime(int distance)
        {
            var speed = SpeedMax > 0 ? SpeedMax : 1d;
            return (int)(distance / speed);
        }

        /// <summary>
        /// Frozen delay for finished trains; live delay vs timetable otherwise.
        /// </summary>
        public int GetDelay(DateTime simulationTime)
        {
            if (completed || damaged || removed || updateFailed)
                return delay;
            return ComputeCurrentDelay(simulationTime);
        }

        public int ComputeCurrentDelay(DateTime simulationTime)
        {
            var waypoint = GetCurrentWayPoint();
            if (waypoint == null)
                return delay;

            if (TrainEvent is TrainStartEvent)
            {
                if (!waypoint.HasDepartureTime || simulationTime <= waypoint.DepartureTime)
                    return 0;
                return SecondsLate(simulationTime, waypoint.DepartureTime);
            }

            if (TrainEvent is TrainSpawnEvent spawn)
                return SecondsLate(spawn.ScheduledTime, DelayDueTime(waypoint));

            if (waypoint.HasActualDepartureTime)
                return SecondsLate(simulationTime, waypoint.DepartureTime);

            // Only a reported platform stop is an arrival. Waiting at a signal or
            // holding for a scheduled dwell is late only vs departure.
            if (waypoint.Processed)
            {
                var arrivalDelay = SecondsLate(waypoint.ActualArrivalTime, waypoint.ScheduledReferenceTime);
                if (!waypoint.HasDepartureTime)
                    return arrivalDelay;
                return Math.Max(arrivalDelay, SecondsLate(simulationTime, waypoint.DepartureTime));
            }

            return SecondsLate(simulationTime, DelayDueTime(waypoint));
        }

        private static DateTime DelayDueTime(TrainWayPoint waypoint)
        {
            return waypoint.HasDepartureTime ? waypoint.DepartureTime : waypoint.ScheduledReferenceTime;
        }

        private static int SecondsLate(DateTime actual, DateTime scheduled)
        {
            if (!TrainWayPoint.HasTime(scheduled))
                return 0;
            return (int)(actual - scheduled).TotalSeconds;
        }

        public void Record(TrainEventBase evt)
        {
            evt.Processed = true;
            Events.Add(evt);
        }

        /// <summary>
        /// Updates the current event's schedule without appending to <see cref="Events"/>.
        /// Returns false if the current event is not <typeparamref name="T"/> so the caller can assign a new one.
        /// </summary>
        public bool TryRescheduleCurrent<T>(DateTime scheduledTime, Action<T>? update = null) where T : TrainEventBase
        {
            if (_trainEvent is not T current)
                return false;

            update?.Invoke(current);
            current.ScheduledTime = scheduledTime;
            return true;
        }

        public void Reset()
        {
            throw new NotImplementedException();
        }

        

        

        
    }
} 