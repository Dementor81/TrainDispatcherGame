using Microsoft.AspNetCore.SignalR;
using TrainDispatcherGame.Server.Models;
using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Simulation;
using System.Linq;

namespace TrainDispatcherGame.Server.Hubs
{
    public class GameHub : Hub
    {
        private static int _activeConnections = 0;
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
            // Track active connections (used to pause when last disconnects)
            System.Threading.Interlocked.Increment(ref _activeConnections);
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
                // Return any trains currently at this player's station
                if (!string.IsNullOrWhiteSpace(player.StationId))
                {
                    await _simulation.ReturnTrainsAtStation(player.StationId);
                }
                _playerManager.DisconnectPlayer(player.Id);
                Console.WriteLine($"Player {player.Id} disconnected from station {player.StationId}");

                // Player disconnected is handled; simulation pause is controlled by connection count below
            }
            
            // Pause the simulation when the last client disconnects
            if (System.Threading.Interlocked.Decrement(ref _activeConnections) == 0)
            {
                _simulation.Pause();
            }

            await base.OnDisconnectedAsync(exception);
        }

        public async Task JoinStation(string playerId, string stationId, string playerName = "")
        {
            // Normalize stationId to lowercase for consistent handling
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            var success = _playerManager.TakeControlOfStation(playerId, normalizedStationId, Context.ConnectionId, playerName);
            
            if (success)
            {
                // Add connection to a group for this station (using normalized ID)
                await Groups.AddToGroupAsync(Context.ConnectionId, $"station_{normalizedStationId}");
                
                // Send confirmation to the client
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = true,
                    playerId = playerId,
                    stationId = normalizedStationId,
                    playerName = playerName,
                    message = $"Successfully joined station {normalizedStationId}"
                });
                
                Console.WriteLine($"Player {playerId} joined station {normalizedStationId} via SignalR");
                
            }
            else
            {
                await Clients.Caller.SendAsync("StationJoined", new
                {
                    success = false,
                    message = $"Failed to join station {normalizedStationId} - already controlled by another player"
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
            // Normalize stationId to lowercase for consistent handling
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            var isControlled = _playerManager.IsStationControlled(normalizedStationId);
            var player = _playerManager.GetPlayerByStation(normalizedStationId);
            
            await Clients.Caller.SendAsync("StationStatus", new
            {
                stationId = normalizedStationId,
                isControlled = isControlled,
                playerId = player?.Id
            });
        }

        public async Task Ping()
        {
            await Clients.Caller.SendAsync("Pong", DateTime.UtcNow);
        }

        public async Task ReceiveTrain(string playerId, string trainNumber, int exitId)
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

                await _simulation.TrainReturnedFromClient(train, exitId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error receiving train {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
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

                _simulation.ReportTrainStopped(train, stationId);
                
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting train stopped {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
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

                _simulation.ReportTrainDeparted(train, stationId); 
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting train departed {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task ReportTrainCollision(string playerId, string trainNumberA, string trainNumberB, string stationId)
        {
            try
            {
                var trainA = _simulation.Trains.FirstOrDefault(t => t.Number == trainNumberA);
                var trainB = _simulation.Trains.FirstOrDefault(t => t.Number == trainNumberB);
                if (trainA == null || trainB == null)
                {
                    Console.WriteLine($"Failed to report collision: One or both trains not found ({trainNumberA}, {trainNumberB})");
                    return;
                }

                _simulation.HandleCollision(trainA, trainB);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting train collision {trainNumberA} vs {trainNumberB}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task ReportTrainDerailed(string playerId, string trainNumber, string stationId, int? switchId)
        {
            try
            {
                var train = _simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    Console.WriteLine($"Failed to report derailment: Train not found ({trainNumber})");
                    return;
                }

                _simulation.HandleDerailment(train, stationId, switchId);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error reporting train derailment {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task RespondApproval(string playerId, string trainNumber, string fromStationId, bool approved)
        {
            try
            {
                _simulation.ReceiveApproval(trainNumber, fromStationId, approved);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing approval response for train {trainNumber}: {ex.Message}");
            }
            await Task.CompletedTask;
        }

        public async Task TrainRemoved(string playerId, string trainNumber, string stationId)
        {
            try
            {
                var train = _simulation.Trains.FirstOrDefault(t => t.Number == trainNumber);
                if (train == null)
                {
                    Console.WriteLine($"Failed to mark train removed {trainNumber}: Train not found in simulation");
                    return;
                }

                train.completed = true;
                train.controlledByPlayer = false;
                Console.WriteLine($"Train {train.Number} removed by client report at station {stationId} (player {playerId})");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing TrainRemoved for train {trainNumber}: {ex.Message}");
            }

            await Task.CompletedTask;
        }

        public async Task SetExitBlockStatus(string playerId, int exitId, bool blocked)
        {
            try
            {
                Console.WriteLine($"Player {playerId} requested to {(blocked ? "block" : "unblock")} exit {exitId}");
                await _simulation.HandleExitBlockStatus(playerId, exitId, blocked);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error setting exit block status for exit {exitId}: {ex.Message}");
            }
        }
    }
} 