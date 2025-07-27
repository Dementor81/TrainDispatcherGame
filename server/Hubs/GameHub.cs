using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Simulation;

namespace TrainDispatcherGame.Server.Hubs
{
    public class GameHub : Hub
    {
        private readonly PlayerManager _playerManager;
        private readonly TrainDispatcherGame.Server.Simulation.Simulation _simulation;

        public GameHub(PlayerManager playerManager, TrainDispatcherGame.Server.Simulation.Simulation simulation)
        {
            _playerManager = playerManager;
            _simulation = simulation;
        }

        public override async Task OnConnectedAsync()
        {
            Console.WriteLine($"Client connected: {Context.ConnectionId}");
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            Console.WriteLine($"Client disconnected: {Context.ConnectionId}");
            
            // Find and disconnect player associated with this connection
            var players = _playerManager.GetAllPlayers();
            var player = players.FirstOrDefault(p => p.Id == Context.ConnectionId);
            if (player != null)
            {
                _playerManager.DisconnectPlayer(player.Id);
                Console.WriteLine($"Player {player.Id} disconnected from station {player.StationId}");
            }
            
            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinStation(string playerId, string stationId)
        {
            var success = _playerManager.TakeControlOfStation(playerId, stationId);
            
            if (success)
            {
                // Add connection to a group for this station
                await Groups.AddToGroupAsync(Context.ConnectionId, $"station_{stationId}");
                
                // Send confirmation to the client
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = true,
                    playerId = playerId,
                    stationId = stationId,
                    message = $"Successfully joined station {stationId}"
                });
                
                Console.WriteLine($"Player {playerId} joined station {stationId} via SignalR");
            }
            else
            {
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = false,
                    message = $"Failed to join station {stationId} - already controlled by another player"
                });
            }
        }

        public async Task LeaveStation(string playerId)
        {
            var success = _playerManager.ReleaseStation(playerId);
            
            if (success)
            {
                // Remove from all station groups
                var player = _playerManager.GetPlayer(playerId);
                if (player != null)
                {
                    await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"station_{player.StationId}");
                }
                
                await Clients.Caller.SendAsync("StationLeft", new
                {
                    success = true,
                    message = "Successfully left station"
                });
            }
            else
            {
                await Clients.Caller.SendAsync("StationLeft", new
                {
                    success = false,
                    message = "Failed to leave station"
                });
            }
        }

        public async Task GetStationStatus(string stationId)
        {
            var isControlled = _playerManager.IsStationControlled(stationId);
            var player = _playerManager.GetPlayerByStation(stationId);
            
            await Clients.Caller.SendAsync("StationStatus", new
            {
                stationId = stationId,
                isControlled = isControlled,
                playerId = player?.Id
            });
        }

        public async Task Ping()
        {
            await Clients.Caller.SendAsync("Pong", DateTime.UtcNow);
        }
    }
} 