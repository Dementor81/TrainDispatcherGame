namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class OpenLineTrackStatusDto
    {
        public string From { get; set; } = string.Empty;
        public int FromExitId { get; set; }
        public string To { get; set; } = string.Empty;
        public int ToExitId { get; set; }
        public int Distance { get; set; }
        public string Mode { get; set; } = string.Empty;
        public string? TrainNumber { get; set; }
    }
}


