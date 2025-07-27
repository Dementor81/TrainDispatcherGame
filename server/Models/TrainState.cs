namespace TrainDispatcherGame.Server.Models
{
    public enum TrainState
    {
        Waiting,    // Train hasn't spawned yet
        Active,     // Train is running
        Completed,  // Train has completed all events
        Delayed     // Train is delayed
    }
} 