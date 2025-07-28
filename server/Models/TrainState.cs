namespace TrainDispatcherGame.Server.Models
{
    public enum TrainState
    {
        Unspawned,    // Train hasn't spawned yet, first event is not due yet
        Active,     // Train is running
        Completed,  // Train has completed all events       
    }
} 