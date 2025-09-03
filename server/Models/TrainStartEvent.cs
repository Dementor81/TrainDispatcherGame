namespace TrainDispatcherGame.Server.Models
{
    public class TrainStartEvent : TrainEventBase
    {
        public string Station { get; set; } = string.Empty;
        public TrainStartEvent(DateTime scheduledTime, string station) : base(scheduledTime)
        {
            Station = station;
        }
    }
}
