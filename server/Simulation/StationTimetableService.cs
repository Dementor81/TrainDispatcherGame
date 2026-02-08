using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Models;

namespace TrainDispatcherGame.Server.Simulation
{
    public class StationTimetableService
    {
        public List<StationTimetableEvent> BuildStationTimetableEvents(IEnumerable<Train> trains, string stationId)
        {
            var stationEvents = new List<StationTimetableEvent>();

            string nextStation = string.Empty;
            string fromStation = string.Empty;

            foreach (var train in trains)
            {
                if (train.completed) continue;

                for (int i = train.CurrentWaypointIndex; i < train.Route.Count; i++)
                {
                    var waypoint = train.Route[i];
                    if (waypoint.Station == stationId)
                    {
                        if (i > 0) fromStation = train.Route[i - 1].Station;
                        else fromStation = stationId;
                        if (i < train.Route.Count - 1) nextStation = train.Route[i + 1].Station;
                        else nextStation = stationId;

                        stationEvents.Add(new StationTimetableEvent
                        {
                            TrainNumber = train.Number,
                            Category = train.Category ?? string.Empty,
                            ArrivalSeconds = (int)waypoint.ArrivalTime.TimeOfDay.TotalSeconds,
                            DepartureSeconds = (int)waypoint.DepartureTime.TimeOfDay.TotalSeconds,
                            CurrentDelay = train.delay,
                            FromStation = fromStation,
                            NextStation = nextStation
                        });
                        break;
                    }
                }                
            }

            return stationEvents;
        }
    }
}


