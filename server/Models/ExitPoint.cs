namespace TrainDispatcherGame.Server.Models
{
    public class ExitPoint
    {
        public int Id { get; set; }
        public string Destination { get; set; } = string.Empty;
        public NetworkConnection? Connection { get; set; }
    }
}


