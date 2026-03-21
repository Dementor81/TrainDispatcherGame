import Train from "../sim/train";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import { EventManager } from "./event_manager";
import { TrackLayoutManager } from "./trackLayout_manager";
import { SignalRManager } from "../network/signalr";
import { SimulationConfig } from "../core/config";
import { TrainSignalHandler } from "./trainSignal_handler";

export interface TrainMovementCallbacks {
   removeTrain(trainNumber: string): boolean;
}

export class TrainMovementHandler {
   private _trackLayoutManager: TrackLayoutManager;
   private _eventManager: EventManager;
   private _signalRManager: SignalRManager;
   private _signalHandler: TrainSignalHandler;
   private _callbacks: TrainMovementCallbacks;

   constructor(
      trackLayoutManager: TrackLayoutManager,
      eventManager: EventManager,
      signalRManager: SignalRManager,
      signalHandler: TrainSignalHandler,
      callbacks: TrainMovementCallbacks
   ) {
      this._trackLayoutManager = trackLayoutManager;
      this._eventManager = eventManager;
      this._signalRManager = signalRManager;
      this._signalHandler = signalHandler;
      this._callbacks = callbacks;
   }

   updateTrainSpeed(train: Train): void {
      const aimedSpeed = Math.max(0, Math.min(train.speedAimed, train.maxAllowedSpeed));
      const dtSeconds = SimulationConfig.simulationIntervalSeconds * SimulationConfig.simulationSpeed;

      if (train.speedCurrent < aimedSpeed) {
         const accelerationStep = SimulationConfig.trainAcceleration * dtSeconds;
         train.speedCurrent = Math.min(aimedSpeed, train.speedCurrent + accelerationStep);
      } else if (train.speedCurrent > aimedSpeed) {
         const remainingDistance = train.distanceToStop;
         let speedRatePerSecond;
         if (remainingDistance === null)
            speedRatePerSecond = 10;
         else
            speedRatePerSecond = Math.max(0.01, (train.speedCurrent * train.speedCurrent) / (2 * remainingDistance));
         const decelerationStep = speedRatePerSecond * dtSeconds;
         train.speedCurrent = Math.max(aimedSpeed, train.speedCurrent - decelerationStep);
         if (train.speedCurrent <= 0.05) train.speedCurrent = 0;
      }
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

      if (remainingLength <= 0 && train.exitId !== null) {
         this._signalRManager.sendTrain(train.number, train.exitId);
         this._callbacks.removeTrain(train.number);
      }
   }
}

export default TrainMovementHandler;
