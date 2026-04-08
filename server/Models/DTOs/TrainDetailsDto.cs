namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class TrainDetailsDto
    {
        public string TrainNumber { get; set; } = string.Empty;
        public string? Category { get; set; }
        public TrainDispatcherGame.Server.Models.TrainType Type { get; set; } = TrainDispatcherGame.Server.Models.TrainType.Passenger;
        public int Cars { get; set; }
        public double SpeedMax { get; set; } // m/s
        public string? FollowingTrainNumber { get; set; }
    }
}
