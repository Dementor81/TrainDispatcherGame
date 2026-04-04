import Train, { TrainState } from "../sim/train";
import { EventManager } from "./event_manager";
import { TrackLayoutManager } from "./trackLayout_manager";
import { ClientSimulation } from "../core/clientSimulation";
import { SimulationConfig } from "../core/config";
import { getTrainWaypoints } from "../network/api";
import { TrainWayPointDto } from "network/dto";

export interface TrainStationCallbacks {
   getDirectionTowardExit(train: Train, waypoints: TrainWayPointDto[]): number | null;
   reverseTrain(trainNumber: string): boolean;
}

export class TrainStationHandler {
   private _eventManager: EventManager;
   private _clientSimulation: ClientSimulation;
   private _trackLayoutManager: TrackLayoutManager;
   private _callbacks: TrainStationCallbacks;

   constructor(
      eventManager: EventManager,
      clientSimulation: ClientSimulation,
      trackLayoutManager: TrackLayoutManager,
      callbacks: TrainStationCallbacks
   ) {
      this._eventManager = eventManager;
      this._clientSimulation = clientSimulation;
      this._trackLayoutManager = trackLayoutManager;
      this._callbacks = callbacks;
   }

   checkStationStop(train: Train): boolean {
      const isFreightPassThrough = train.type === 'Freight' && train.action !== 'End';
      const currentTrack = train.position!.track;

      if (!train.shouldStopAtCurrentStation || !currentTrack.halt || train.state === TrainState.MANUAL_CONTROL || isFreightPassThrough || train.waitingProgress === 1) return false;

      const currentSimulationTime = this._clientSimulation.currentSimulationTime!;
      const stoppingPoint = currentTrack.length / 2 + train.length / 2 * train.movingDirection;
      const remainingDistanceToStop = (stoppingPoint - train.position!.km);

      console.log(`${train.number} remainingDistanceToStop: ${remainingDistanceToStop}`);
      if (remainingDistanceToStop < -0.1 || remainingDistanceToStop > SimulationConfig.trainLookaheadDistance)
         return false;

      if (train.state === TrainState.BRAKING_FOR_SIGNAL || train.state === TrainState.WAITING_AT_SIGNAL) {
         return true;
      }

      if (train.isStationState()) {
         if (train.speedCurrent > 0) {
            train.setState(TrainState.BRAKING_FOR_STATION, remainingDistanceToStop);
            return false;
         }

         if (train.state !== TrainState.WAITING_AT_STATION) {
            train.setState(TrainState.WAITING_AT_STATION, 0);
         }

         if (!train.stationStopStartTime) {
            train.setStationStopStartTime(new Date(currentSimulationTime));
            train.setWaitingProgress(0);
            this._eventManager.emit("trainStoppedAtStation", train);
         }

         if (train.action === 'End' && train.followingTrainNumber) {
            void this.handleTrainEnding(train);
            train.setState(TrainState.ENDED, 0);
            return true;
         }

         if (train.departureTime && currentSimulationTime >= train.departureTime) {
            train.setWaitingProgress(1);

            const nextSignal = this._trackLayoutManager.getNextSignal(train.position!.track, train.position!.km, train.movingDirection);
            if (nextSignal && !nextSignal.isTrainAllowedToGo()) {
               train.setStoppedBySignal(nextSignal, 0);
               this._eventManager.emit("trainStoppedBySignal", train, nextSignal);
               return true;
            }


            train.setState(TrainState.RUNNING);
            this._eventManager.emit("trainDepartedFromStation", train);
            return false;
         }

         if (train.departureTime && train.stationStopStartTime) {
            const totalMs = Math.max(1, train.departureTime.getTime() - train.stationStopStartTime.getTime());
            const elapsedMs = currentSimulationTime.getTime() - train.stationStopStartTime.getTime();
            train.setWaitingProgress(elapsedMs / totalMs);
         }
         return true;
      }

      if (train.arrivalTime && train.departureTime && currentSimulationTime > train.arrivalTime) {
         let departureTime = new Date(currentSimulationTime.getTime() + SimulationConfig.stationMinStopTime * 1000);
         if (departureTime < train.departureTime) {
            departureTime = train.departureTime;
         }
         train.setScheduleTimes(train.arrivalTime, departureTime);
      }

      train.setState(TrainState.BRAKING_FOR_STATION, remainingDistanceToStop);
      return false;
   }

   async handleTrainEnding(train: Train): Promise<void> {
      const oldNumber = train.number;
      const followingTrainNumber = train.followingTrainNumber;

      if (!followingTrainNumber) {
         console.warn(`Train ${oldNumber} has action 'End' but no following train number`);
         return;
      }

      try {
         const waypoints = await getTrainWaypoints(followingTrainNumber);
         const firstWaypoint = waypoints[0];
         const newDirection = this._callbacks.getDirectionTowardExit(train, waypoints);

         train.number = followingTrainNumber;
         train.setScheduleTimes(new Date(firstWaypoint.arrivalTime), new Date(firstWaypoint.departureTime));
         train.action = firstWaypoint.action as any;

         if (newDirection !== null && newDirection !== train.movingDirection) {
            this._callbacks.reverseTrain(followingTrainNumber);
         }

         train.setStationStopStartTime(this._clientSimulation.currentSimulationTime);
         train.setState(TrainState.WAITING_AT_STATION, 0);
         train.setWaitingProgress(0);

         console.log(`Train ${oldNumber} transformed into ${followingTrainNumber} at station, new direction: ${newDirection}`);

         this._eventManager.emit('trainTransformed', train, oldNumber, followingTrainNumber);

      } catch (error) {
         console.error(`Failed to fetch waypoints for following train ${followingTrainNumber}:`, error);
      }
   }
}

export default TrainStationHandler;
