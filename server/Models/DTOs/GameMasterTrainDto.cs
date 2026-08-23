namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class GameMasterTrainDto
    {
        public string Number { get; set; } = string.Empty;
        public string? Category { get; set; }
        public TrainDispatcherGame.Server.Models.TrainType Type { get; set; }
        public bool Completed { get; set; }
        public bool Damaged { get; set; }
        public string? CurrentLocation { get; set; }
        public string? HeadingForStation { get; set; }
        public int Delay { get; set; }
        public DateTime? NextEventTime { get; set; }
        public string? NextEventType { get; set; }
        public string? SpawnStation { get; set; }
    }
}
