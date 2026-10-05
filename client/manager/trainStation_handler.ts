import Train, { TrainState } from "../sim/train";
import { EventManager } from "./event_manager";
import { TrackLayoutManager } from "./trackLayout_manager";
import { ClientSimulation } from "../core/clientSimulation";
import { SimulationConfig } from "../core/config";
import Tools from "../core/utils";
import { getTrainWaypoints } from "../network/api";
import { TrainWayPointActionType, TrainWayPointDto } from "../network/dto";
import Application from "@core/application";

export class TrainStationHandler {
   private _eventManager: EventManager;
   private _clientSimulation: ClientSimulation;
   private _trackLayoutManager: TrackLayoutManager;

   constructor(application: Application) {
      this._eventManager = application.eventManager;
      this._clientSimulation = application.clientSimulation;
      this._trackLayoutManager = application.trackLayoutManager;
   }

   /** Returns true when the train is handled by the station stop and needs no further evaluation this tick. */
   checkStationStop(train: Train): boolean {
      if (!train.shouldStopAtCurrentStation || !train.position!.track.halt || train.waitingProgress === 1) return false;
      if (Tools.is(train.state, [TrainState.WAITING_FOR_NEXT_SERVICE, TrainState.DUE_FOR_NEXT_SERVICE, TrainState.MANUAL_CONTROL])) return false;

      const now = this._clientSimulation.currentSimulationTime!;

      if (train.state === TrainState.WAITING_AT_STATION) {
         if (!train.departureTime || !train.stationStopStartTime) throw new Error("Train is waiting at the station but has no departure time or station stop start time");
         if (now < train.departureTime) {
            const totalMs = Math.max(1, train.departureTime.getTime() - train.stationStopStartTime.getTime());
            train.setWaitingProgress((now.getTime() - train.stationStopStartTime.getTime()) / totalMs);
            return true;
         }

         train.setWaitingProgress(1);
         const nextSignal = this._trackLayoutManager.getNextSignal(train.position!.track, train.position!.km, train.movingDirection);
         if (nextSignal && !nextSignal.isTrainAllowedToGo()) {
            train.setStoppedBySignal(nextSignal, 0);
            this._eventManager.emit("trainStoppedBySignal", train, nextSignal);
            return false;
         }
         if (train.action !== 'End' && !nextSignal && this._trackLayoutManager.isDeadEnd(train.position!.track, train.movingDirection)) {
            train.setState(TrainState.MISROUTED, 0);
            return true;
         }
         train.setState(TrainState.RUNNING);
         this._eventManager.emit("trainDepartedFromStation", train);
         return false;
      }

      if (train.speedCurrent === 0) {
         train.setState(TrainState.WAITING_AT_STATION, 0);
         train.setStationStopStartTime(new Date(now));
         const earliestDeparture = new Date(now.getTime() + SimulationConfig.stationMinStopTime * 1000);
         if (!train.departureTime || earliestDeparture > train.departureTime) train.departureTime = earliestDeparture;
         console.log(`Train ${train.number} stopped at station, departure time: ${train.departureTime}`);
         this._eventManager.emit("trainStoppedAtStation", train);
         return true;
      }

      if (train.state !== TrainState.BRAKING_FOR_STATION) {
         const remainingDistanceToStop = Math.abs(this.getStationStoppingPoint(train) - train.position!.km);
         if (remainingDistanceToStop < SimulationConfig.trainLookaheadDistance) train.setState(TrainState.BRAKING_FOR_STATION, remainingDistanceToStop);
      }
      return false;
   }

   private getStationStoppingPoint(train: Train): number {
      const track = train.position!.track;
      const dir = train.movingDirection;
      const length = train.length;
      const platform = this._trackLayoutManager.platforms.find(p => p.track === track.id);
      const mid = platform ? (platform.from_km + platform.to_km) / 2 : track.length / 2;
      const desired = mid + (length / 2) * dir;
      if (length >= track.length) return desired;
      const minHead = dir > 0 ? length : 0;
      const maxHead = dir > 0 ? track.length : track.length - length;
      return Math.min(maxHead, Math.max(minHead, desired));
   }

   holdBeforeServiceStart(train: Train): boolean {
      const now = this._clientSimulation.currentSimulationTime;
      if (train.state !== TrainState.RUNNING || train.speedCurrent > 0.1 || !train.arrivalTime || !now || train.arrivalTime < now) return false;
      train.setState(TrainState.WAITING_FOR_NEXT_SERVICE, 0);
      return true;
   }

   holdDueForNextService(train: Train): boolean {
      if (!train.serviceReleasePending) return false;
      const now = this._clientSimulation.currentSimulationTime;
      if (!train.arrivalTime || !now || !(train.arrivalTime < now)) return false;

      if (train.state === TrainState.DUE_FOR_NEXT_SERVICE) {
         if (this.canStartService(train)) {
            train.serviceReleasePending = false;
            train.setState(TrainState.RUNNING, 0);
         }
         return true;
      }

      if (train.state === TrainState.RUNNING && train.speedCurrent <= 0.1) {
         if (!this.canStartService(train)) {
            train.setState(TrainState.DUE_FOR_NEXT_SERVICE, 0);
            return true;
         }
         train.serviceReleasePending = false;
      }
      return false;
   }

   private canStartService(train: Train): boolean {
      const position = train.position;
      if (!position) return false;
      const signal = this._trackLayoutManager.getSignalBeforeSwitch(position.track, position.km, train.movingDirection);
      if (!signal) return false;
      return !train.passengers || position.track.halt;
   }

   checkTrainEnding(train: Train): boolean {
      if (train.state === TrainState.WAITING_FOR_NEXT_SERVICE) {
         if (train.arrivalTime! < this._clientSimulation.currentSimulationTime!) train.setState(TrainState.DUE_FOR_NEXT_SERVICE, 0);
         return true;
      }

      if (train.action === 'End' && train.waitingProgress === 1) {
         void this.handleTrainEnding(train);
         return true;
      }
      return false;
   }

   /** Turns the train so it heads toward the exit leading to its next waypoint (or back toward the previous one at its last station). */
   alignDirectionToward(train: Train, waypoints: TrainWayPointDto[]): void {
      if (!train.position || !train.tailPosition) return;
      if (this.directionToward(train, waypoints) !== train.movingDirection) train.reverse();
   }

   private directionToward(train: Train, waypoints: TrainWayPointDto[]): number {
      const currentIndex = waypoints.findIndex((wp) => wp.station === this._trackLayoutManager.layoutId);
      const next = waypoints[currentIndex + 1];
      const target = next ?? waypoints[currentIndex - 1];
      const exit = target ? this._trackLayoutManager.findExitToStation(target.station) : null;
      if (!exit) {
         console.warn(`Train ${train.number}: no exit found to station ${target?.station}, keeping current direction`);
         return train.movingDirection;
      }
      const exitDirection = this._trackLayoutManager.getExitPointDirection(exit.id);
      return next ? -exitDirection : exitDirection;
   }

   async handleTrainEnding(train: Train): Promise<void> {
      const oldNumber = train.number;
      const followingTrainNumber = train.followingTrainNumber;

      if (!followingTrainNumber) {
         console.warn(`Train ${oldNumber} has action 'End' but no following train number`);
         train.setState(TrainState.ENDED, 0);
         return;
      }

      try {
         const waypoints = await getTrainWaypoints(followingTrainNumber);
         const firstWaypoint = waypoints[0];
         if (!firstWaypoint) throw new Error(`Following train ${followingTrainNumber} has no waypoints`);
         const now = this._clientSimulation.currentSimulationTime;
         if (!now) throw new Error("Cannot transform train without simulation time");

         const minStopMs = SimulationConfig.stationMinStopTime * 1000;
         const earliestDeparture = new Date(now.getTime() + minStopMs);
         const scheduledDeparture = firstWaypoint.departureTime ? new Date(firstWaypoint.departureTime) : null;
         const departure = scheduledDeparture && scheduledDeparture > earliestDeparture ? scheduledDeparture : earliestDeparture;

         train.number = followingTrainNumber;
         train.action = firstWaypoint.action as TrainWayPointActionType;
         train.setScheduleTimes(new Date(departure.getTime() - minStopMs), departure);
         this.alignDirectionToward(train, waypoints);
         train.setStationStopStartTime(new Date(now));
         train.serviceReleasePending = true;
         train.setState(TrainState.WAITING_FOR_NEXT_SERVICE, 0);
         train.setWaitingProgress(0);

         console.log(`Train ${oldNumber} transformed into ${followingTrainNumber} at station`);
         this._eventManager.emit('trainTransformed', train, oldNumber, followingTrainNumber);
      } catch (error) {
         console.error(`Failed to fetch waypoints for following train ${followingTrainNumber}:`, error);
      }
   }
}

export default TrainStationHandler;
