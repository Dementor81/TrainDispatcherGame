namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class AdminSessionDto
    {
        public string GameCode { get; set; } = string.Empty;
        public string ScenarioId { get; set; } = string.Empty;
        public string ScenarioTitle { get; set; } = string.Empty;
        public string State { get; set; } = string.Empty;
        public DateTime LastAccessUtc { get; set; }
        public List<PlayerControlledStationDto> Players { get; set; } = new();
    }
}
