namespace TrainDispatcherGame.Server.Models
{
    public class OpenLineTrack
    {        
        public NetworkConnection Connection { get; set; } = new();
        public List<Train> Trains { get; set; } = new();

        public OpenLineTrack(NetworkConnection connection)
        {
            Connection = connection;
        }

        public bool AddTrain(Train train)
        {
            if(Connection.Blocks > 0 && Trains.Count == Connection.Blocks)
            {
                return false;
            }
            Trains.Add(train);
            return true;
        }

        public void RemoveTrain(Train train)
        {
            Trains.Remove(train);
        }
    }
}

