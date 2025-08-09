using System;

namespace TrainDispatcherGame.Server.Models
{
    public class Player
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string StationId { get; set; } = string.Empty;
        public string ConnectionId { get; set; } = string.Empty;
        public DateTime ConnectedAt { get; set; }
        public bool IsActive { get; set; } = true;

        public Player(string id, string stationId, string connectionId = "", string name = "")
        {
            Id = id;
            Name = name;
            StationId = stationId;
            ConnectionId = connectionId;
            ConnectedAt = DateTime.UtcNow;
        }
    }
} 