using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Hubs;

namespace TrainDispatcherGame.Server.Managers
{
    public interface INotificationManager
    {
        Task SendTrain(string stationId, Train train, string? exitPointId = null);
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
                
                
                await _hubContext.Clients.Group($"station_{stationId}").SendAsync("TrainSent", new
                {
                    trainNumber = train.Number,
                    stationId = stationId,
                    exitPointId = exitPointId,
                    sendTime = DateTime.UtcNow,
                    message = $"Train {train.Number} is ready for control at station {stationId}"
                });
                
                Console.WriteLine($"Sent train {train.Number} to player {player.Id} at station {stationId}, exit point {exitPointId}");
            }
            else
            {
                Console.WriteLine($"No player found for station {stationId}");
            }
        }
    }
} 