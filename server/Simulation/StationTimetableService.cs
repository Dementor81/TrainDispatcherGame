using TrainDispatcherGame.Server.Models.DTOs;
using TrainDispatcherGame.Server.Models;

namespace TrainDispatcherGame.Server.Simulation
{
    public class StationTimetableService
    {
        public List<StationTimetableEvent> BuildStationTimetableEvents(IEnumerable<Train> trains, string stationId)
        {
            var stationEvents = new List<StationTimetableEvent>();

            foreach (var train in trains)
            {
                if (train.completed) continue;

                var currentEvent = train.GetWayPoint();
                if (currentEvent == null) continue;

                var futureEvents = train
                    .GetFutureWayPoints()
                    .Where(e => e.Station.Equals(stationId, StringComparison.OrdinalIgnoreCase));

                foreach (var futureEvent in futureEvents)
                {
                    string fromStation = string.Empty;
                    var allEvents = train.Route;
                    var eventIndex = allEvents.IndexOf(futureEvent);
                    if (eventIndex > 0)
                    {
                        for (int i = eventIndex - 1; i >= 0; i--)
                        {
                            var prev = allEvents[i];
                            if (prev != null)
                            {
                                fromStation = prev.Station;
                                break;
                            }
                        }
                    }

                    string nextStation = string.Empty;
                    if (eventIndex >= 0 && eventIndex + 1 < allEvents.Count)
                    {
                        nextStation = allEvents[eventIndex + 1].Station;
                    }

                    stationEvents.Add(new StationTimetableEvent
                    {
                        TrainNumber = train.Number,
                        Arrival = futureEvent.ArrivalTime.ToString("HH:mm:ss"),
                        Departure = futureEvent.DepartureTime.ToString("HH:mm:ss"),
                        CurrentDelay = train.delay,
                        FromStation = fromStation,
                        NextStation = nextStation
                    });
                }
            }

            stationEvents.Sort((a, b) =>
            {
                if (DateTime.TryParse(a.Departure, out var departureA) &&
                    DateTime.TryParse(b.Departure, out var departureB))
                {
                    return departureA.CompareTo(departureB);
                }
                return string.Compare(a.Departure, b.Departure, StringComparison.Ordinal);
            });

            return stationEvents;
        }
    }
}


