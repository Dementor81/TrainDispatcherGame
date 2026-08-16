namespace TrainDispatcherGame.Server.Models
{
    public class OpenLineTrack
    {        
        public NetworkConnection Connection { get; set; } = new();
        public Train? TrainOnTrack { get; set; }
        // Train waiting to enter this track when it becomes free.
        public string? WaitingTrainNumber { get; set; }

        public OpenLineTrack(NetworkConnection connection)
        {
            Connection = connection;
            TrainOnTrack = null;
        }

        public bool AddTrain(Train train)
        {
            if (this.TrainOnTrack != null) return false;
            this.TrainOnTrack = train;
            return true;
        }

        public void RemoveTrain()
        {
            this.TrainOnTrack = null;
        }

    }
}

