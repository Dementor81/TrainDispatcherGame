import Train from "../sim/train";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import { EventManager } from "./event_manager";
import { TrackLayoutManager } from "./trackLayout_manager";
import { SignalRManager } from "../network/signalr";
import { SimulationConfig } from "../core/config";
import { TrainSignalHandler } from "./trainSignal_handler";
import Application from "@core/application";
import { ClientSimulation } from "@core/clientSimulation";

export interface TrainMovementCallbacks {
   removeTrain(trainNumber: string): boolean;
   syncOccupancy(train: Train): void;
}

export class TrainMovementHandler {
   private _trackLayoutManager: TrackLayoutManager;
   private _clientSimulation: ClientSimulation;
   private _eventManager: EventManager;
   private _signalRManager: SignalRManager;
   private _signalHandler: TrainSignalHandler;
   private _callbacks: TrainMovementCallbacks;

   constructor(application:Application,
      signalHandler: TrainSignalHandler,
      callbacks: TrainMovementCallbacks
   ) {
      this._trackLayoutManager = application.trackLayoutManager;
      this._clientSimulation = application.clientSimulation;
      this._eventManager = application.eventManager;
      this._signalRManager = application.signalRManager;
      this._signalHandler = signalHandler;
      this._callbacks = callbacks;
   }

   /** Signed distance traveled this tick. Braking uses constant deceleration and stops at distanceToStop. */
   updateTrainSpeed(train: Train): number {
      const aimedSpeed = Math.max(0, Math.min(train.speedAimed, train.maxAllowedSpeed));
      const dtSeconds = SimulationConfig.simulationIntervalSeconds * this._clientSimulation.speed;
      const direction = train.movingDirection;
      const speed = train.speedCurrent;

      if (speed < aimedSpeed) {
         const accelerationStep = SimulationConfig.trainAcceleration * dtSeconds;
         train.speedCurrent = Math.min(aimedSpeed, speed + accelerationStep);
         return train.speedCurrent * dtSeconds * direction;
      }

      if (speed > aimedSpeed) {
         const step = this.brakingStep(speed, aimedSpeed, train.distanceToStop, dtSeconds);
         train.speedCurrent = step.speed;
         return step.travel * direction;
      }

      return speed * dtSeconds * direction;
   }

   private brakingStep(
      speed: number,
      aimed: number,
      remaining: number | null,
      dt: number
   ): { speed: number; travel: number } {
      if (speed <= 0.05 || (remaining !== null && remaining <= 0)) return { speed: 0, travel: 0 };

      const decel = remaining === null ? 10 : (speed * speed) / (2 * remaining);
      if (!Number.isFinite(decel) || decel <= 0) return { speed: 0, travel: Math.max(0, remaining ?? 0) };
      const timeToAimed = (speed - aimed) / decel;
      const arrived = dt >= timeToAimed;
      const step = Math.min(dt, timeToAimed);
      let travel = speed * step - 0.5 * decel * step * step;
      if (remaining !== null) travel = Math.min(Math.max(0, travel), remaining);
      let nextSpeed = arrived ? aimed : Math.max(0, speed - decel * dt);
      if (nextSpeed <= 0.05 && (arrived || remaining === null)) nextSpeed = 0;
      return { speed: nextSpeed, travel };
   }

   /**
    * Returns true if tail was updated, false if derailed (hit a switch).
    */
   updateTailPosition(train: Train, trainLengthOverride: number | null = null): boolean {
      if (!train.position) throw new Error(`Train ${train.number} has no position`);
      const trainLength = trainLengthOverride ?? train.getLength();
      if (trainLength <= 0) {
         train.setTailPosition(train.position.track, train.position.km);
         return true;
      }

      const tailOffset = -trainLength * train.movingDirection;

      try {
         const tailResult = this._trackLayoutManager.followRailNetwork(train.position.track, train.position.km, tailOffset);

         if (tailResult.element instanceof Track) {
            train.setTailPosition(tailResult.element, tailResult.km);
            return true;
         } else if (tailResult.element instanceof Switch) {
            return false;
         } else if (tailResult.element instanceof Exit) {
            const exitLocation = this._trackLayoutManager.getExitPointLocation(tailResult.element.id);
            const boundaryTrack = exitLocation.track ?? train.position.track;
            const boundaryKm =
               exitLocation.track !== null
                  ? exitLocation.km
                  : (tailOffset < 0 ? 0 : train.position.track.length);
            train.setTailPosition(boundaryTrack, boundaryKm);
            return true;
         } else {
            throw new Error(`Unknown element type: ${tailResult.element}`);
         }
      } catch (error) {
         train.setTailPosition(train.position?.track, train.position?.km);
         return true;
      }
   }

   updateExitingTrain(train: Train): void {
      if (!train.position || train.exitBoundaryKm === null) return;

      const movedDistance = Math.abs(train.getMovementDistance());
      if (movedDistance <= 0.001) return;

      const previousTailTrack = train.tailPosition?.track ?? null;
      const previousTailKm = train.tailPosition?.km ?? null;

      train.advanceExitProgress(movedDistance);
      const remainingLength = Math.max(0, train.getLength() - train.exitProgressMeters);

      train.setPosition(train.position.track, train.exitBoundaryKm);
      this.updateTailPosition(train, remainingLength);

      this._signalHandler.checkSignalsPassedByTail(
         train,
         previousTailTrack,
         previousTailKm,
         train.tailPosition?.track ?? null,
         train.tailPosition?.km ?? 0
      );

      if (train.tailPosition?.track !== previousTailTrack) {
         this._eventManager.emit("trainTailPassed", { track: previousTailTrack });
      }

      if (train.position && train.tailPosition) {
         this._callbacks.syncOccupancy(train);
      }

      if (remainingLength <= 0 && train.exitId !== null) {
         this._signalRManager.sendTrain(train.number, train.exitId);
         this._callbacks.removeTrain(train.number);
      }
   }
}

export default TrainMovementHandler;
