using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Hubs;

namespace TrainDispatcherGame.Server.Managers
{
    public interface INotificationManager
    {
        Task SendTrain(string stationId, Train train, string? exitPointId = null);
        Task SendSimulationStateChange(SimulationState newState, int speed);
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
            // Normalize stationId to lowercase for consistent handling
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            if (player != null)
            {
                // Get the current event for this train
                var currentEvent = train.GetCurrentWayPoint();
                bool shouldStopAtStation = currentEvent?.Stops == true && 
                                         string.Equals(currentEvent.Station, normalizedStationId, StringComparison.OrdinalIgnoreCase);
                
                // Prepare arrival and departure times
                DateTime? arrivalTime = null;
                DateTime? departureTime = null;
                
                if (currentEvent != null && string.Equals(currentEvent.Station, normalizedStationId, StringComparison.OrdinalIgnoreCase))
                {
                    arrivalTime = currentEvent.ArrivalTime;
                    departureTime = currentEvent.DepartureTime;
                }
                
                await _hubContext.Clients.Group($"station_{normalizedStationId}").SendAsync("TrainSent", new
                {
                    trainNumber = train.Number,
                    stationId = normalizedStationId,
                    exitPointId = exitPointId,
                    shouldStopAtStation = shouldStopAtStation,
                    arrivalTime = arrivalTime,
                    departureTime = departureTime,
                    cars = train.Cars,
                    delay = train.delay,
                    speed = train.Speed
                });
                
                Console.WriteLine($"Sent train {train.Number} to player {player.Id} at station {normalizedStationId}, exit point {exitPointId}, should stop: {shouldStopAtStation}, arrival: {arrivalTime}, departure: {departureTime}");
            }
            else
            {
                Console.WriteLine($"No player found for station {normalizedStationId}");
            }
        }

        public async Task SendSimulationStateChange(SimulationState newState, int speed)
        {
            await _hubContext.Clients.All.SendAsync("SimulationStateChanged", new
            {
                state = newState.ToString(),
                timestamp = DateTime.UtcNow,
                speed = speed
            });
            
            Console.WriteLine($"Sent simulation state change to all clients: {newState}");
        }

        public async Task SendApprovalRequest(string stationId, string fromStationId, string trainNumber)
        {
            // Normalize stationIds to lowercase for consistent handling
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            var normalizedFromStationId = fromStationId?.ToLowerInvariant() ?? string.Empty;
            
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            if (player != null)
            {
                await _hubContext.Clients.Group($"station_{normalizedStationId}").SendAsync("ApprovalRequested", new
                {
                    stationId = normalizedStationId,
                    fromStationId = normalizedFromStationId,
                    trainNumber = trainNumber
                });
                Console.WriteLine($"Approval requested from station {normalizedStationId} for train {trainNumber} coming from {normalizedFromStationId}");
            }
            else
            {
                Console.WriteLine($"Approval request skipped: no player at station {normalizedStationId}");
            }
        }

        // No collision broadcast needed; clients handle locally
    }
} 