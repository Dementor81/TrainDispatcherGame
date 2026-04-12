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

   private static parseScheduledTime(value?: string | null): Date | null {
      return value ? new Date(value) : null;
   }

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

   /// <summary>
   /// Checks if the train should stop at the current station.
   /// </summary>
   /// <param name="train">The train to check.</param>
   /// <returns>True if the calling function can skip evaluating the train further, since it is already stopped at the station</returns>
   checkStationStop(train: Train): boolean {
      const isFreightPassThrough = train.type === 'Freight' && train.action !== 'End';
      if ((!train.shouldStopAtCurrentStation) || !train.position!.track.halt || train.state === TrainState.WAITING_FOR_NEXT_SERVICE || train.state === TrainState.MANUAL_CONTROL || (isFreightPassThrough) || train.waitingProgress === 1) return false;

      const currentSimulationTime = this._clientSimulation.currentSimulationTime!;

      if (train.state === TrainState.WAITING_AT_STATION) {
         if (!train.departureTime || !train.stationStopStartTime) throw new Error("Train is waiting at the station but has no departure time or station stop start time");
         if (train.departureTime && currentSimulationTime >= train.departureTime) {
            train.setWaitingProgress(1);
            const nextSignal = this._trackLayoutManager.getNextSignal(train.position!.track, train.position!.km, train.movingDirection);
            if (nextSignal && !nextSignal.isTrainAllowedToGo()) {
               train.setStoppedBySignal(nextSignal, 0);
               this._eventManager.emit("trainStoppedBySignal", train, nextSignal);
               return false;
            } else {
               train.setState(TrainState.RUNNING);
               this._eventManager.emit("trainDepartedFromStation", train);
               return false;
            }
         } else {
            //train is still waiting at the station, calculate the waiting progress
            const totalMs = Math.max(1, train.departureTime.getTime() - train.stationStopStartTime.getTime()); //prevents division by zero or negative values
            train.setWaitingProgress((currentSimulationTime.getTime() - train.stationStopStartTime.getTime()) / totalMs);
            return true;
         }
      }

      //at this point we know that the train should stop at the current rack 

      // train is too far away to stop

      //if (train.state == TrainState.RUNNING || train.state == TrainState.BRAKING_FOR_SIGNAL) 
      { // train is not running, so we can't stop it

         if (train.speedCurrent > 0) {
            if(train.state === TrainState.BRAKING_FOR_STATION) return false;
            const stoppingPoint = train.position!.track.length / 2 + train.length / 2 * train.movingDirection;
            const remainingDistanceToStop = Math.abs(stoppingPoint - train.position!.km);
            if (remainingDistanceToStop < SimulationConfig.trainLookaheadDistance) {
               //train is still moving, so we need to brake
               train.setState(TrainState.BRAKING_FOR_STATION, remainingDistanceToStop);
               return false;
            }
         } else {
            //train is stopped, so we need to wait at the station
            train.setState(TrainState.WAITING_AT_STATION, 0);
            train.setStationStopStartTime(new Date(currentSimulationTime));

            let departureTime = new Date(currentSimulationTime.getTime() + SimulationConfig.stationMinStopTime * 1000);
            if (!train.departureTime || departureTime > train.departureTime) {
               train.departureTime = departureTime;
            }

            return true;
         }
      }

      return false;
   }

   checkTrainEnding(train: Train) {
      if (train.state === TrainState.WAITING_FOR_NEXT_SERVICE) {
         if (train.arrivalTime! < this._clientSimulation.currentSimulationTime!)
            train.setState(TrainState.RUNNING, 0);
         return true;
      }

      if (train.action === 'End' && train.waitingProgress === 1) {
         //the train should end, has already completed its last stop, new we havt to wait for the next service
         void this.handleTrainEnding(train);
         return true;
      }
      return false;

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
         if (!firstWaypoint) {
            throw new Error(`Following train ${followingTrainNumber} has no waypoints`);
         }

         const newDirection = this._callbacks.getDirectionTowardExit(train, waypoints);
         const simulationTime = this._clientSimulation.currentSimulationTime;
         if (!simulationTime) {
            throw new Error("Cannot transform train without simulation time");
         }

         const currentSimulationTime = new Date(simulationTime);
         const scheduledDeparture = TrainStationHandler.parseScheduledTime(firstWaypoint.departureTime);

         const minimumDepartureTime = new Date(currentSimulationTime.getTime() + SimulationConfig.stationMinStopTime * 1000);
         const adjustedDepartureTime = scheduledDeparture && scheduledDeparture > minimumDepartureTime
            ? scheduledDeparture
            : minimumDepartureTime;

         train.arrivalTime = new Date(adjustedDepartureTime.getTime() - SimulationConfig.stationMinStopTime * 1000);


         train.number = followingTrainNumber;
         train.departureTime = adjustedDepartureTime;
         train.action = firstWaypoint.action as any;

         if (newDirection !== null && newDirection !== train.movingDirection) {
            this._callbacks.reverseTrain(followingTrainNumber);
         }

         train.setStationStopStartTime(currentSimulationTime);
         train.setState(TrainState.WAITING_FOR_NEXT_SERVICE, 0);
         train.setWaitingProgress(0);

         console.log(`Train ${oldNumber} transformed into ${followingTrainNumber} at station, new direction: ${newDirection}`);

         this._eventManager.emit('trainTransformed', train, oldNumber, followingTrainNumber);

      } catch (error) {
         console.error(`Failed to fetch waypoints for following train ${followingTrainNumber}:`, error);
      }
   }
}

export default TrainStationHandler;
