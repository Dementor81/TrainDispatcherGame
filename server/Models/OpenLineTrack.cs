namespace TrainDispatcherGame.Server.Models
{
    public class OpenLineTrack
    {        
        public NetworkConnection Connection { get; set; } = new();
        public Train? TrainOnTrack { get; set; }

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

        public void RemoveTrain(Train train)
        {
            if (this.TrainOnTrack != train) throw new Exception($"Train {train.Number} cant be removed from this track because it is not on this track");
            this.TrainOnTrack = null;
        }

    }
}

