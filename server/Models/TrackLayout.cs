using System.Collections.Generic;
using TrainDispatcherGame.Server.Models.DTOs;

namespace TrainDispatcherGame.Server.Models
{
    public class TrackLayout
    {
        public string Id { get; set; } = string.Empty;
        public List<ExitPoint> Exits { get; set; } = new List<ExitPoint>();
        public int MaxExitDistance { get; set; }
        public List<TrackDto> Tracks { get; set; } = new List<TrackDto>();
        public List<SwitchDto> Switches { get; set; } = new List<SwitchDto>();
    }
}


