using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Hubs;

namespace TrainDispatcherGame.Server.Managers
{
    public interface INotificationManager
    {
        Task SendTrain(string stationId, Train train, string? exitPointId = null);
        Task SendSimulationStateChange(SimulationState newState);
        Task SendApprovalRequest(string stationId, string fromStationId, string trainNumber);
        // No collision broadcast needed; clients handle locally
    }

    public class NotificationManager : INotificationManager
    {
        private readonly IHubContext<GameHub> _hubContext;
        private readonly PlayerManager _playerManager;

        public NotificationManager(IHubContext<GameHub> hubContext, PlayerManager playerManager)
        {
            _hubContext = hubContext;
            _playerManager = playerManager;
        }

        public async Task SendTrain(string stationId, Train train, string? exitPointId = null)
        {
            var player = _playerManager.GetPlayerByStation(stationId);
            if (player != null)
            {
                // Get the current event for this train
                var currentEvent = train.GetWayPoint();
                bool shouldStopAtStation = currentEvent?.Stops == true && 
                                         currentEvent.Station == stationId;
                
                // Prepare arrival and departure times
                DateTime? arrivalTime = null;
                DateTime? departureTime = null;
                
                if (currentEvent != null && currentEvent.Station == stationId)
                {
                    arrivalTime = currentEvent.ArrivalTime;
                    departureTime = currentEvent.DepartureTime;
                }
                
                await _hubContext.Clients.Group($"station_{stationId}").SendAsync("TrainSent", new
                {
                    trainNumber = train.Number,
                    stationId = stationId,
                    exitPointId = exitPointId,
                    shouldStopAtStation = shouldStopAtStation,
                    arrivalTime = arrivalTime,
                    departureTime = departureTime,
                    cars = train.Cars,
                    delay = train.delay,
                    speed = train.Speed
                });
                
                Console.WriteLine($"Sent train {train.Number} to player {player.Id} at station {stationId}, exit point {exitPointId}, should stop: {shouldStopAtStation}, arrival: {arrivalTime}, departure: {departureTime}");
            }
            else
            {
                Console.WriteLine($"No player found for station {stationId}");
            }
        }

        public async Task SendSimulationStateChange(SimulationState newState)
        {
            await _hubContext.Clients.All.SendAsync("SimulationStateChanged", new
            {
                state = newState.ToString(),
                timestamp = DateTime.UtcNow
            });
            
            Console.WriteLine($"Sent simulation state change to all clients: {newState}");
        }

        public async Task SendApprovalRequest(string stationId, string fromStationId, string trainNumber)
        {
            var player = _playerManager.GetPlayerByStation(stationId);
            if (player != null)
            {
                await _hubContext.Clients.Group($"station_{stationId}").SendAsync("ApprovalRequested", new
                {
                    stationId = stationId,
                    fromStationId = fromStationId,
                    trainNumber = trainNumber
                });
                Console.WriteLine($"Approval requested from station {stationId} for train {trainNumber} coming from {fromStationId}");
            }
            else
            {
                Console.WriteLine($"Approval request skipped: no player at station {stationId}");
            }
        }

        // No collision broadcast needed; clients handle locally
    }
} 