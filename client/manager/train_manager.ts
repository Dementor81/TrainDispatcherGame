import Train, { TrainState } from "../sim/train";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import { EventManager } from "./event_manager";
import { TrackLayoutManager } from "./trackLayout_manager";
import Tools from "../core/utils";
import { SignalRManager } from "../network/signalr";
import { ClientSimulation } from "../core/clientSimulation";
import { getTrainWaypoints } from "../network/api";
import { TrainWayPointDto } from "network/dto";
import { TrainSignalHandler } from "./trainSignal_handler";
import { TrainStationHandler } from "./trainStation_handler";
import { TrainMovementHandler } from "./trainMovement_handler";
import Application from "@core/application";

export class TrainManager {
   private _trains: Train[] = [];
   private _application: Application;
   private _eventManager: EventManager;
   private _trackLayoutManager: TrackLayoutManager;
   private _signalHandler: TrainSignalHandler;
   private _stationHandler: TrainStationHandler;
   private _movementHandler: TrainMovementHandler;

   constructor(
      application: Application
   ) {
      this._application = application;
      this._eventManager = application.eventManager;
      this._trackLayoutManager = application.trackLayoutManager;

      this._signalHandler = new TrainSignalHandler(this._trackLayoutManager, this._eventManager);
      this._stationHandler = new TrainStationHandler(this._eventManager, this._application.clientSimulation, this._trackLayoutManager, {
         getDirectionTowardExit: (train, waypoints) => this.getDirectionTowardExit(train, waypoints),
         reverseTrain: (trainNumber) => this.reverseTrain(trainNumber),
      });     
      this._movementHandler = new TrainMovementHandler(this._application, this._signalHandler, {
         removeTrain: (trainNumber) => this.removeTrain(trainNumber),
      });
      this._eventManager.on("trainCreated", (train: Train, exitPointId: number) => {
         this.handleTrainCreated(train, exitPointId);
      });

      this._eventManager.on("simulationStopped", () => {
         this.clearAllTrains();
      });
   }

   // ==================== SIMULATION ====================

   public updateSimulation(): void {
      for (const train of this._trains) {
         this.updateTrain(train);
         this._eventManager.emit("trainUpdated", train);
      }
   }

   private updateTrain(train: Train): void {
      if (!train.position) throw new Error(`Train ${train.number} has no position`);

      if (train.isExiting) {
         this._movementHandler.updateExitingTrain(train);
         return;
      }

      if (Train.isHardStoppedState(train.state)) return;

      const isEmergencyBraking = train.state === TrainState.EMERGENCY_BRAKING;
      if (!isEmergencyBraking) {
         this._signalHandler.checkTrainStoppedBySignal(train);
         this._stationHandler.checkStationStop(train);
      }

      this._movementHandler.updateTrainSpeed(train);

      if (isEmergencyBraking && train.speedCurrent <= 0.05) {
         train.setState(TrainState.EMERGENCY_STOP, 0);
         return;
      }

      this.promoteWaitingStates(train);

      if (!this.isMovementState(train.state)) return;

      const movedDistance = train.getMovementDistance();
      if (Math.abs(movedDistance) <= 0.001) return;

      try {
         const result = this._trackLayoutManager.followRailNetwork(train.position.track, train.position.km, movedDistance);
         train.consumeDistanceToStop(Math.abs(movedDistance));

         if (result.element instanceof Track) {
            const previousTrack = train.position.track;
            const previousKm = train.position.km;
            const previousTailTrack = train.tailPosition?.track;
            const previousTailKm = train.tailPosition?.km ?? null;

            train.setPosition(result.element, result.km);

            const tailUpdated = this._movementHandler.updateTailPosition(train);
            if (!tailUpdated) {
               console.warn(`Train ${train.number} derailed at switch ${result.element.id}`);
               this._eventManager.emit("trainDerailed", train, result.element);
               train.setState(TrainState.DERAILEMENT, 0);
               return;
            }

            const blockingTrain = this.detectTrainCollision(train);
            if (blockingTrain) {
               this._eventManager.emit("trainCollision", train, blockingTrain);
               train.setState(TrainState.COLLISION, 0);
               blockingTrain.setState(TrainState.COLLISION, 0);
               return;
            }

            this._signalHandler.checkSignalsPassedByTail(train, previousTailTrack ?? null, previousTailKm, train.tailPosition?.track ?? null, train.tailPosition?.km ?? 0);

            if (train.tailPosition?.track !== previousTailTrack) {
               this._eventManager.emit("trainTailPassed", { track: previousTailTrack });
            }

            this._signalHandler.checkSignalsPassed(train, previousTrack, previousKm, result.element, result.km);
            return;
         } else if (result.element instanceof Exit) {
            const exit = result.element;
            const boundaryKm = train.movingDirection > 0 ? train.position.track.length : 0;
            train.setPosition(train.position.track, boundaryKm);
            this._movementHandler.updateTailPosition(train);
            if (train.state === TrainState.MANUAL_CONTROL) {
               train.setState(TrainState.END_OF_TRACK, 0);
               return;
            }
            void this.checkExitAndProceed(train, exit, boundaryKm);
            return;
         } else if (result.element instanceof Switch) {
            console.log(`Train ${train.number} stopped at switch ${result.element.id}`);
            this._eventManager.emit("trainDerailed", train, result.element);
            train.setState(TrainState.DERAILEMENT, 0);
            return;
         } else {
            console.error(`Train ${train.number} encountered unknown element`);
            return;
         }
      } catch (error) {
         console.error(`Train ${train.number} movement error: ${error instanceof Error ? error.message : 'Unknown error'}`);
         return;
      }
   }

   private isMovementState(state: TrainState): boolean {
      return Tools.is(state, [TrainState.RUNNING, TrainState.EMERGENCY_BRAKING, TrainState.BRAKING_FOR_SIGNAL, TrainState.BRAKING_FOR_STATION, TrainState.MANUAL_CONTROL]);
   }

   private promoteWaitingStates(train: Train): void {
      const speedStopEpsilon = 0.05;
      if (train.speedCurrent > speedStopEpsilon) return;

      if (train.state === TrainState.BRAKING_FOR_SIGNAL) {
         train.setState(TrainState.WAITING_AT_SIGNAL, 0);
      } else if (train.state === TrainState.BRAKING_FOR_STATION) {
         train.setState(TrainState.WAITING_AT_STATION, 0);
      }
   }

   private detectTrainCollision(train: Train): Train | null {
      const currentTrack = train.position?.track;
      if (!currentTrack) return null;

      for (const other of this._trains) {
         if (other === train || other.tailPosition === null || other.position === null) continue;
         if (other.tailPosition.track !== currentTrack) continue;

         const otherTrainFront = other.position.km;
         const otherTrainBack = other.tailPosition.km;

         if (Tools.between(train.position.km, otherTrainBack, otherTrainFront)) return other;
      }
      return null;
   }

   // ==================== TRAIN MANAGEMENT ====================

   spawnTrainAtExitPoint(train: Train, exitPointId: number): void {
      const location = this._trackLayoutManager.getExitPointLocation(exitPointId);
      const direction = this._trackLayoutManager.getExitPointDirection(exitPointId);
      if (location.track) {
         train.setPosition(location.track, location.km);
         train.setMovingDirection(direction);
         train.setDrawingDirection(-direction);
         this._movementHandler.updateTailPosition(train);
         console.log(`Train ${train.number} positioned on track ${location.track.id} at km ${location.km} with direction ${direction}`);
      } else {
         console.error(`Could not find track for exit point ${exitPointId}`);
      }

      this._trains.push(train);
      this._eventManager.emit("trainAdded", train);
   }

   public spawnLocalTestTrain(): Train | null {
      const track = this._trackLayoutManager.tracks.find(t => t.id === 183);
      if (!track) {
         console.warn("TrainManager: Cannot spawn local test train - no tracks loaded");
         return null;
      }

      const trainNumber = this.generateUniqueTestTrainNumber();
      const train = new Train(this._application, trainNumber, 3, 30, 'Passenger');
      train.speedCurrent = 0;
      const direction = 1;
      train.setDrawingDirection(direction);
      train.setPosition(track, 212);
      train.setMovingDirection(direction);
      train.setState(TrainState.EMERGENCY_STOP, 0);
      this._movementHandler.updateTailPosition(train);

      this._eventManager.emit("trainAdded", train);
      this._trains.push(train);
      return train;
   }

   removeTrain(trainNumber: string): boolean {
      const index = this._trains.findIndex((train) => train.number === trainNumber);
      if (index !== -1) {
         this._trains.splice(index, 1);
         this._eventManager.emit("trainsUpdated");
         return true;
      }
      return false;
   }

   getTrain(trainNumber: string): Train | undefined {
      return this._trains.find((train) => train.number === trainNumber);
   }

   getAllTrains(): Train[] {
      return this._trains;
   }

   clearAllTrains(): void {
      this._trains = [];
      this._eventManager.emit("trainsUpdated");
   }

   public async continueTrainAfterManualControl(train: Train): Promise<void> {
      const waypoints = await getTrainWaypoints(train.number);
      const newDirection = this.getDirectionTowardExit(train, waypoints);

      if (newDirection !== null && newDirection !== train.movingDirection) {
         this.reverseTrain(train.number);
      }

      train.endManualControl();
   }

   public reverseTrain(trainNumber: string): boolean {
      const train = this.getTrain(trainNumber);
      if (!train || !train.position || !train.tailPosition) return false;

      train.reverse();
      return true;
   }

   // ==================== PRIVATE HELPERS ====================

   private generateUniqueTestTrainNumber(): string {
      let i = 1;
      while (true) {
         const candidate = `TEST-${i}`;
         if (!this._trains.some((train) => train.number === candidate)) return candidate;
         i++;
      }
   }

   private handleTrainCreated(train: Train, exitPointId: number): void {
      console.log(`TrainManager: Received train ${train.getInfo()}`);
      this.spawnTrainAtExitPoint(train, exitPointId);
   }

   private async checkExitAndProceed(train: Train, exit: Exit, boundaryKm: number): Promise<void> {
      try {
         const waypoints = await getTrainWaypoints(train.number);
         const currentStation = this._trackLayoutManager.layoutId;
         const currentIndex = waypoints.findIndex((wp) => wp.station === currentStation);
         if (currentIndex < 0 || currentIndex >= waypoints.length) {
            console.error(`Failed to check exit for train ${train.number}: current station not found in waypoints`);
            train.startExiting(exit.id, boundaryKm);
         } else {
            const nextStation = waypoints[currentIndex + 1].station;
            const exitDestination = this._trackLayoutManager.getExitDestinationStation(exit);
            if (exitDestination === nextStation) {
               train.startExiting(exit.id, boundaryKm);
            } else {
               train.setState(TrainState.MISROUTED, 0);
               this._eventManager.emit("trainMisrouted", train);
            }
         }
      } catch (error) {
         console.error(`Failed to check exit for train ${train.number}:`, error);
         train.startExiting(exit.id, boundaryKm);
      }
   }

   private getDirectionTowardExit(train: Train, waypoints: TrainWayPointDto[]): number | null {
      if (waypoints.length < 1) throw new Error(`Train ${train.number} has no waypoints`);

      const currentStation = this._trackLayoutManager.layoutId;
      const currentIndex = waypoints.findIndex((wp) => wp.station === currentStation);
      let new_direction = train.movingDirection;
      if (currentIndex === waypoints.length - 1) {
         //the current station is the last station, so we need to find the exit to the previous station and return the opposite direction of that exit
         const previousStation = waypoints[currentIndex - 1].station;
         const exit = this._trackLayoutManager.findExitToStation(previousStation);
         if (exit) {
            new_direction = this._trackLayoutManager.getExitPointDirection(exit.id);
         } else {
            console.warn(`No exit found to station ${previousStation}, keeping current direction`);
         }
      } else {
         const nextWaypoint = waypoints[currentIndex + 1];
         if (nextWaypoint) {
            const exit = this._trackLayoutManager.findExitToStation(nextWaypoint.station);
            if (exit) {
               new_direction = -this._trackLayoutManager.getExitPointDirection(exit.id);
            } else {
               console.warn(`No exit found to station ${nextWaypoint.station}, keeping current direction`);
            }
         } else {
            throw new Error(`Train ${train.number} has only one waypoint, cannot determine direction`);
         }
      }
      return new_direction;
   }
}

export default TrainManager;
