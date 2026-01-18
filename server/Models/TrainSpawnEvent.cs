using System;

namespace TrainDispatcherGame.Server.Models
{
    public class TrainSpawnEvent : TrainEventBase
    {        
        public NetworkConnection Connection { get; set; } = new();
        public bool IsReversed { get; set; } = false;

        public string HeadingStation => IsReversed ? Connection.FromStation : Connection.ToStation;
        public int HeadingExitId => IsReversed ? Connection.FromExitId : Connection.ToExitId;
        public int CommingFromExitId => IsReversed ? Connection.ToExitId : Connection.FromExitId;

        public TrainSpawnEvent(DateTime scheduledTime, NetworkConnection? connection = null, bool isReversed = false) : base(scheduledTime)
        {
                if (connection != null)
                {
                    Connection = connection;
                }
                IsReversed = isReversed;
        }
    }
}