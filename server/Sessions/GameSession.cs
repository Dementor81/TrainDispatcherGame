using TrainDispatcherGame.Server.Managers;
using TrainDispatcherGame.Server.Services;

namespace TrainDispatcherGame.Server.Sessions
{
    public class GameSession
    {
        public GameSession(
            string sessionId,
            TrainDispatcherGame.Server.Simulation.Simulation simulation,
            PlayerManager playerManager,
            NotificationManager notificationManager,
            TrackLayoutService trackLayoutService)
        {
            SessionId = sessionId;
            Simulation = simulation;
            PlayerManager = playerManager;
            NotificationManager = notificationManager;
            TrackLayoutService = trackLayoutService;
            Touch();
        }

        public string SessionId { get; }
        public TrainDispatcherGame.Server.Simulation.Simulation Simulation { get; }
        public PlayerManager PlayerManager { get; }
        public NotificationManager NotificationManager { get; }
        public TrackLayoutService TrackLayoutService { get; }
        public DateTime LastAccessUtc { get; private set; }

        public void Touch()
        {
            LastAccessUtc = DateTime.UtcNow;
        }
    }
}
