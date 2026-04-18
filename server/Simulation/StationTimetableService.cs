using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Models;

namespace TrainDispatcherGame.Server.Simulation
{
    public class StationTimetableService
    {
        private static DateTime? NormalizeScheduledTime(DateTime time)
        {
            return time.Year <= 1 ? null : time;
        }

        public List<StationTimetableEvent> BuildStationTimetableEvents(IEnumerable<Train> trains, string stationId)
        {
            var stationEvents = new List<StationTimetableEvent>();

            foreach (var train in trains)
            {
                if (train.completed) continue;
                if (train.Route.Count == 0) continue;

                for (int i = train.CurrentWaypointIndex; i < train.Route.Count; i++)
                {
                    var waypoint = train.Route[i];
                    if (waypoint.Station == stationId)
                    {
                        stationEvents.Add(new StationTimetableEvent
                        {
                            TrainNumber = train.Number,
                            Category = train.Category ?? string.Empty,
                            ArrivalTime = NormalizeScheduledTime(waypoint.ArrivalTime),
                            DepartureTime = NormalizeScheduledTime(waypoint.DepartureTime),
                            CurrentDelay = train.delay,
                            FromStation = train.Route[0].Station,
                            NextStation = train.Route[^1].Station
                        });
                        break;
                    }
                }                
            }

            return stationEvents;
        }
    }
}


