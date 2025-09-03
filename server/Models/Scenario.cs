

namespace TrainDispatcherGame.Server.Models
{
    public class Scenario
    {
        public string Title { get; set; } = string.Empty;
        public DateTime StartTime { get; set; } = DateTime.MinValue;
        public List<Train> Trains { get; set; } = new();

        public Scenario(string title, DateTime startTime, List<Train> trains)
        {
            Title = title;
            StartTime = startTime;
            Trains = trains;
        }
    }
}