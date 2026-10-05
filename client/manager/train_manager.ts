import Train, { TrainState } from "../sim/train";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import { EventManager } from "./event_manager";
import { TrackLayoutManager } from "./trackLayout_manager";
import Tools from "../core/utils";
import { getTrainWaypoints } from "../network/api";
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

   constructor(application: Application) {
      this._application = application;
      this._eventManager = application.eventManager;
      this._trackLayoutManager = application.trackLayoutManager;
      this._signalHandler = new TrainSignalHandler(this._trackLayoutManager, this._eventManager);
      this._stationHandler = new TrainStationHandler(application);
      this._movementHandler = new TrainMovementHandler(application);

      this._eventManager.on("trainCreated", (train: Train, exitPointId: number) => this.spawnTrainAtExitPoint(train, exitPointId));
      this._eventManager.on("simulationStopped", () => this.clearAllTrains());
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

      try {
         if (train.isExiting) {
            if (this._movementHandler.updateExitingTrain(train)) {
               this._application.signalRManager.sendTrain(train.number, train.exitId!);
               this.removeTrain(train.number);
            }
            return;
         }
         if (Train.isHardStoppedState(train.state)) return;
         if (train.state === TrainState.PASSED_RED_SIGNAL && train.speedCurrent === 0) return;

         if (!Tools.is(train.state, [TrainState.EMERGENCY_BRAKING, TrainState.PASSED_RED_SIGNAL])) {
            if (this._stationHandler.holdBeforeServiceStart(train)) return;
            if (this._stationHandler.holdDueForNextService(train)) return;
            if (this._stationHandler.checkStationStop(train)) return;
            if (this._stationHandler.checkTrainEnding(train)) return;
            this._signalHandler.checkTrainStoppedBySignal(train);
         }

         const movedDistance = this._movementHandler.updateTrainSpeed(train);
         if (Math.abs(movedDistance) > 0.001) this.moveTrain(train, movedDistance);
         this.updateTrainStates(train);
      } finally {
         if (this.getTrain(train.number)) this.syncOccupancy(train);
      }
   }

   private moveTrain(train: Train, distance: number): void {
      const { element, track, km, segments } = this._trackLayoutManager.walk(train.position!.track, train.position!.km, distance);
      train.consumeDistanceToStop(segments.reduce((total, segment) => total + Math.abs(segment.toKm - segment.fromKm), 0));
      train.setPosition(track, km);
      const tailOnTrack = this._movementHandler.updateTailPosition(train);

      const crashed = this.detectCrash(train, element, tailOnTrack);
      this._signalHandler.passSignals(train, segments);
      this._signalHandler.enforceSignalsBehindHead(train);
      if (crashed || element instanceof Track) return;

      if (train.state === TrainState.MANUAL_CONTROL) train.setState(TrainState.END_OF_TRACK, 0);
      else if (element instanceof Exit) void this.checkExitAndProceed(train, element, km);
      else train.setState(TrainState.MISROUTED, 0);
   }

   /** Derailment (head ran into a blocking switch or the tail left the rails) or collision; both end the train's movement. */
   private detectCrash(train: Train, element: Track | Switch | Exit | null, tailOnTrack: boolean): boolean {
      if (element instanceof Switch || !tailOnTrack) {
         this._eventManager.emit("trainDerailed", train, element instanceof Switch ? element : undefined);
         train.setState(TrainState.DERAILEMENT, 0);
         return true;
      }
      const other = this.detectTrainCollision(train);
      if (!other) return false;
      this._eventManager.emit("trainCollision", train, other);
      train.setState(TrainState.COLLISION, 0);
      other.setState(TrainState.COLLISION, 0);
      return true;
   }

   private detectTrainCollision(train: Train): Train | null {
      const head = train.position!;
      for (const other of this._trains) {
         if (other === train || !other.tailPosition || !other.position || other.tailPosition.track !== head.track) continue;
         if (Tools.between(head.km, other.tailPosition.km, other.position.km)) return other;
      }
      return null;
   }

   private updateTrainStates(train: Train): void {
      if (train.speedCurrent !== 0) return;

      if (train.state === TrainState.EMERGENCY_BRAKING) train.setState(TrainState.EMERGENCY_STOP, 0);
      if (train.state === TrainState.PASSED_RED_SIGNAL) return;

      if (train.stoppedByEndOfTrack && (train.state === TrainState.BRAKING_FOR_SIGNAL || train.state === TrainState.WAITING_AT_SIGNAL)) {
         train.setState(TrainState.MISROUTED, 0);
         return;
      }

      if (train.state === TrainState.BRAKING_FOR_SIGNAL) train.setState(TrainState.WAITING_AT_SIGNAL, 0);
   }

   private syncOccupancy(train: Train): void {
      this._application.trainRouteManager.syncTrainOccupancy(train);
   }

   private async checkExitAndProceed(train: Train, exit: Exit, boundaryKm: number): Promise<void> {
      if (train.action === 'End') {
         train.setState(TrainState.MISROUTED, 0);
         return;
      }

      try {
         const waypoints = await getTrainWaypoints(train.number);
         const currentIndex = waypoints.findIndex((wp) => wp.station === this._trackLayoutManager.layoutId);
         const nextStation = currentIndex >= 0 ? waypoints[currentIndex + 1]?.station : undefined;
         if (nextStation && this._trackLayoutManager.getExitDestinationStation(exit) === nextStation) {
            train.startExiting(exit.id, boundaryKm);
         } else {
            train.setState(TrainState.MISROUTED, 0);
         }
      } catch (error) {
         console.error(`Failed to check exit for train ${train.number}:`, error);
         train.startExiting(exit.id, boundaryKm);
      }
   }

   // ==================== TRAIN MANAGEMENT ====================

   private addTrain(train: Train, track: Track, km: number, direction: number): void {
      train.setPosition(track, km);
      train.setMovingDirection(direction);
      train.setDrawingDirection(-direction);
      this._movementHandler.updateTailPosition(train);
      this._trains.push(train);
      this.syncOccupancy(train);
      this._eventManager.emit("trainAdded", train);
   }

   spawnTrainAtExitPoint(train: Train, exitPointId: number): void {
      const { track, km } = this._trackLayoutManager.getExitPointLocation(exitPointId);
      if (!track) {
         console.error(`Could not find track for exit point ${exitPointId}`);
         return;
      }
      this.addTrain(train, track, km, this._trackLayoutManager.getExitPointDirection(exitPointId));
   }

   public spawnLocalTestTrain(): Train | null {
      const track = this._trackLayoutManager.tracks.find(t => t.id === 183);
      if (!track) {
         console.warn("TrainManager: Cannot spawn local test train - no tracks loaded");
         return null;
      }

      let i = 1;
      while (this._trains.some((train) => train.number === `TEST-${i}`)) i++;
      const train = new Train(this._application, `TEST-${i}`, 3, 30, 'MultipleUnit');
      train.setState(TrainState.EMERGENCY_STOP, 0);
      this.addTrain(train, track, 212, 1);
      return train;
   }

   removeTrain(trainNumber: string): boolean {
      const index = this._trains.findIndex((train) => train.number === trainNumber);
      if (index === -1) return false;
      this._application.trainRouteManager.removeOccupancyForTrain(this._trains[index]);
      this._trains.splice(index, 1);
      this._eventManager.emit("trainsUpdated");
      return true;
   }

   getTrain(trainNumber: string): Train | undefined {
      return this._trains.find((train) => train.number === trainNumber);
   }

   getAllTrains(): Train[] {
      return this._trains;
   }

   clearAllTrains(): void {
      this._trains = [];
      this._application.trainRouteManager.clearTrackOccupancy();
      this._eventManager.emit("trainsUpdated");
   }

   public async endTrainService(train: Train): Promise<void> {
      this._eventManager.emit("trainStoppedAtStation", train);
      await this._stationHandler.handleTrainEnding(train);
   }

   public async continueTrainAfterManualControl(train: Train): Promise<void> {
      this._stationHandler.alignDirectionToward(train, await getTrainWaypoints(train.number));
      train.endManualControl();
   }
}

export default TrainManager;
