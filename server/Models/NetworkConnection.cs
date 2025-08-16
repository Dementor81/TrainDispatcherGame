namespace TrainDispatcherGame.Server.Models
{
    public class NetworkConnection
    {
        public enum TrackMode
        {
            Regular = 0,
            WrongDirection = 1
        }
        public string FromStation { get; set; } = string.Empty;
        public int FromExitId { get; set; }
        public string ToStation { get; set; } = string.Empty;
        public int ToExitId { get; set; }
        public int Distance { get; set; } //m
        public int Blocks { get; set; }
        public TrackMode Mode { get; set; } = TrackMode.Regular;
    }
}


