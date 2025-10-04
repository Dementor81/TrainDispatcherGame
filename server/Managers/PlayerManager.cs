using System;
using System.Collections.Generic;
using System.Linq;
using TrainDispatcherGame.Server.Models;

namespace TrainDispatcherGame.Server.Managers
{
    public class PlayerManager
    {
        private readonly Dictionary<string, Player> _players = new();
        private readonly Dictionary<string, string> _stationToPlayer = new(); // stationId -> playerId
        private readonly object _syncRoot = new();

        public bool TakeControlOfStation(string playerId, string stationId, string connectionId = "", string playerName = "")
        {
            // Normalize stationId to lowercase for case-insensitive comparison
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            lock (_syncRoot)
            {
                // Check if station is already controlled by another player
                if (_stationToPlayer.ContainsKey(normalizedStationId))
                {
                    var existingPlayerId = _stationToPlayer[normalizedStationId];
                    if (existingPlayerId != playerId)
                    {
                        return false; // Station already controlled by another player
                    }
                    return true; // Player already controls this station
                }

                // Remove player from any previous station
                RemovePlayerFromStation(playerId);

                // Create new player or update existing one
                var player = new Player(playerId, normalizedStationId, connectionId, playerName);
                _players[playerId] = player;
                _stationToPlayer[normalizedStationId] = playerId;
            }

            Console.WriteLine($"Player {playerId} took control of station {normalizedStationId}");
            return true;
        }

        public bool ReleaseStation(string playerId)
        {
            Player? player;
            lock (_syncRoot)
            {
                if (!_players.ContainsKey(playerId))
                {
                    return false;
                }

                player = _players[playerId];
                RemovePlayerFromStation(playerId);
            }
            
            Console.WriteLine($"Player {playerId} released control of station {player.StationId}");
            return true;
        }

        public Player? GetPlayer(string playerId)
        {
            lock (_syncRoot)
            {
                return _players.TryGetValue(playerId, out var player) ? player : null;
            }
        }

        public Player? GetPlayerByStation(string stationId)
        {
            // Normalize stationId to lowercase for case-insensitive comparison
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            lock (_syncRoot)
            {
                if (!_stationToPlayer.TryGetValue(normalizedStationId, out var playerId))
                {
                    return null;
                }

                return _players.TryGetValue(playerId, out var player) ? player : null;
            }
        }

        public List<Player> GetAllPlayers()
        {
            lock (_syncRoot)
            {
                return _players.Values.Where(p => p.IsActive).ToList();
            }
        }

        public List<string> GetControlledStations()
        {
            lock (_syncRoot)
            {
                return _stationToPlayer.Keys.ToList();
            }
        }

        public bool IsStationControlled(string stationId)
        {
            // Normalize stationId to lowercase for case-insensitive comparison
            var normalizedStationId = stationId?.ToLowerInvariant() ?? string.Empty;
            
            lock (_syncRoot)
            {
                return _stationToPlayer.ContainsKey(normalizedStationId);
            }
        }

        public bool IsPlayerActive(string playerId)
        {
            lock (_syncRoot)
            {
                return _players.TryGetValue(playerId, out var player) && player.IsActive;
            }
        }

        public void DisconnectPlayer(string playerId)
        {
            lock (_syncRoot)
            {
                if (_players.ContainsKey(playerId))
                {
                    var player = _players[playerId];
                    player.IsActive = false;
                    RemovePlayerFromStation(playerId);
                    Console.WriteLine($"Player {playerId} disconnected from station {player.StationId}");
                }
            }
        }

        private void RemovePlayerFromStation(string playerId)
        {
            lock (_syncRoot)
            {
                if (_players.TryGetValue(playerId, out var player))
                {
                    _stationToPlayer.Remove(player.StationId);
                }
            }
        }

        public void ClearAllPlayers()
        {
            lock (_syncRoot)
            {
                _players.Clear();
                _stationToPlayer.Clear();
            }
            Console.WriteLine("All players cleared");
        }
    }
} 