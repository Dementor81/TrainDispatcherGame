using TrainDispatcherGame.Server.Models;

namespace TrainDispatcherGame.Server.Models.DTOs
{
    public class GameMasterSnapshotDto
    {
        public List<GameMasterTrainDto> Trains { get; set; } = new();
        public List<OpenLineTrackStatusDto> OpenLineTracks { get; set; } = new();
        public List<PlayerControlledStationDto> ControlledStations { get; set; } = new();
        public List<MajorEvent> MajorEvents { get; set; } = new();
        public int RunningCount { get; set; }
        public int FinishedCount { get; set; }
        public int RemovedCount { get; set; }
        public int AccidentCount { get; set; }
        public int CausedDelaySeconds { get; set; }
    }
}
