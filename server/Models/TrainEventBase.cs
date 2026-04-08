using System;

namespace TrainDispatcherGame.Server.Models
{
	public abstract class TrainEventBase
	{
		private DateTime _scheduledTime;
		public DateTime ScheduledTime
		{
			get => _scheduledTime;
			set
			{
				_scheduledTime = value;
				Processed = false;
			}
		}
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


