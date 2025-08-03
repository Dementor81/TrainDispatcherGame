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

        public bool TakeControlOfStation(string playerId, string stationId, string connectionId = "")
        {
            // Check if station is already controlled by another player
            if (_stationToPlayer.ContainsKey(stationId))
            {
                var existingPlayerId = _stationToPlayer[stationId];
                if (existingPlayerId != playerId)
                {
                    return false; // Station already controlled by another player
                }
                return true; // Player already controls this station
            }

            // Remove player from any previous station
            RemovePlayerFromStation(playerId);

            // Create new player or update existing one
            var player = new Player(playerId, stationId, connectionId);
            _players[playerId] = player;
            _stationToPlayer[stationId] = playerId;

            Console.WriteLine($"Player {playerId} took control of station {stationId}");
            return true;
        }

        public bool ReleaseStation(string playerId)
        {
            if (!_players.ContainsKey(playerId))
            {
                return false;
            }

            var player = _players[playerId];
            RemovePlayerFromStation(playerId);
            
            Console.WriteLine($"Player {playerId} released control of station {player.StationId}");
            return true;
        }

        public Player? GetPlayer(string playerId)
        {
            return _players.TryGetValue(playerId, out var player) ? player : null;
        }

        public Player? GetPlayerByStation(string stationId)
        {
            if (!_stationToPlayer.TryGetValue(stationId, out var playerId))
            {
                return null;
            }

            return GetPlayer(playerId);
        }

        public List<Player> GetAllPlayers()
        {
            return _players.Values.Where(p => p.IsActive).ToList();
        }

        public List<string> GetControlledStations()
        {
            return _stationToPlayer.Keys.ToList();
        }

        public bool IsStationControlled(string stationId)
        {
            return _stationToPlayer.ContainsKey(stationId);
        }

        public bool IsPlayerActive(string playerId)
        {
            return _players.TryGetValue(playerId, out var player) && player.IsActive;
        }

        public void DisconnectPlayer(string playerId)
        {
            if (_players.ContainsKey(playerId))
            {
                var player = _players[playerId];
                player.IsActive = false;
                RemovePlayerFromStation(playerId);
                Console.WriteLine($"Player {playerId} disconnected from station {player.StationId}");
            }
        }

        private void RemovePlayerFromStation(string playerId)
        {
            if (_players.TryGetValue(playerId, out var player))
            {
                _stationToPlayer.Remove(player.StationId);
            }
        }

        public void ClearAllPlayers()
        {
            _players.Clear();
            _stationToPlayer.Clear();
            Console.WriteLine("All players cleared");
        }
    }
} 