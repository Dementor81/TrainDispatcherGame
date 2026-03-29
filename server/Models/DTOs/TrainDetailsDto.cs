namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrainDetailsDto
    {
        public string TrainNumber { get; set; } = string.Empty;
        public string? Category { get; set; }
        public string Type { get; set; } = string.Empty;
        public int Cars { get; set; }
        public double SpeedMax { get; set; } // m/s
        public string? FollowingTrainNumber { get; set; }
    }
}
