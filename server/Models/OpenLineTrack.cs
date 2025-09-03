namespace TrainDispatcherGame.Server.Models
{
    public class OpenLineTrack
    {        
        public NetworkConnection Connection { get; set; } = new();
        public List<Train> Trains { get; set; } = new();
        public int BlockSection { get; set; }

        public OpenLineTrack(NetworkConnection connection)
        {
            Connection = connection;
            BlockSection = 1;
        }

        public bool AddTrain(Train train)
        {
            if(Trains.Count == BlockSection)
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

