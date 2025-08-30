using System;

namespace TrainDispatcherGame.Server.Models
{
	public abstract class TrainEventBase
	{
		public DateTime ScheduledTime { get; set; }
		public bool Processed { get; set; }

		protected TrainEventBase(DateTime scheduledTime)
		{
			ScheduledTime = scheduledTime;
			Processed = false;
		}

		public bool IsDue(DateTime currentTime)
		{
			return ScheduledTime <= currentTime && !Processed;
		}
	}
}


