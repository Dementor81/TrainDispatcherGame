namespace TrainDispatcherGame.Server.Sessions
{
    public enum SessionCreateStatus
    {
        Created,
        AlreadyExists,
        NotReserved,
        InvalidScenario,
        AtCapacity
    }
}
