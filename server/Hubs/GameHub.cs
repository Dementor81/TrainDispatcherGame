using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Simulation;
using System.Linq;

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
            // We need to track which connection belongs to which player
            var players = _playerManager.GetAllPlayers();
            var player = players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
            if (player != null)
            {
                _playerManager.DisconnectPlayer(player.Id);
                Console.WriteLine($"Player {player.Id} disconnected from station {player.StationId}");
            }
            
            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinStation(string playerId, string stationId)
        {
            var success = _playerManager.TakeControlOfStation(playerId, stationId, Context.ConnectionId);
            
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

        public async Task ReceiveTrain(string playerId, string trainNumber, string destinationStationId)
        {
            try
            {      
                // Find the existing train in simulation
                var train = _simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    Console.WriteLine($"Failed to receive train {trainNumber}: Train not found in simulation");
                    return;
                }

                _simulation.TrainReturnedFromClient(train,destinationStationId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error receiving train {trainNumber}: {ex.Message}");
            }
        }

        public async Task ReportTrainStopped(string playerId, string trainNumber, string stationId)
        {
            try
            {
                // Find the existing train in simulation
                var train = _simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    Console.WriteLine($"Failed to report train stopped {trainNumber}: Train not found in simulation");
                    return;
                }

                var success = _simulation.ReportTrainStopped(train, stationId);
                
                if (success)
                {
                    Console.WriteLine($"Train {trainNumber} reported stopped at station {stationId}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting train stopped {trainNumber}: {ex.Message}");
            }
        }

        public async Task ReportTrainDeparted(string playerId, string trainNumber, string stationId)
        {
            try
            {
                // Find the existing train in simulation
                var train = _simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    Console.WriteLine($"Failed to report train departed {trainNumber}: Train not found in simulation");
                    return;
                }

                var success = _simulation.ReportTrainDeparted(train, stationId);
                
                if (success)
                {
                    Console.WriteLine($"Train {trainNumber} reported departed from station {stationId}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting train departed {trainNumber}: {ex.Message}");
            }
        }
    }
} 