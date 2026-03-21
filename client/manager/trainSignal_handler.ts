import Train from "../sim/train";
import Track from "../sim/track";
import Signal from "../sim/signal";
import { EventManager } from "./event_manager";
import { TrackLayoutManager } from "./trackLayout_manager";
import { SimulationConfig } from "../core/config";
import Tools from "../core/utils";
import { TrainState } from "../sim/train";

export class TrainSignalHandler {
   private _trackLayoutManager: TrackLayoutManager;
   private _eventManager: EventManager;

   constructor(trackLayoutManager: TrackLayoutManager, eventManager: EventManager) {
      this._trackLayoutManager = trackLayoutManager;
      this._eventManager = eventManager;
   }

   checkTrainStoppedBySignal(train: Train): void {
      if (train.isManualControl) return;

      if (train.stoppedBySignal !== null) {
         if (train.stoppedBySignal.isTrainAllowedToGo()) {
            train.setStoppedBySignal(null);
            if (train.waitingProgress === 1) {
               train.setState(TrainState.RUNNING);
               this._eventManager.emit("trainDepartedFromStation", train);
               return;
            }
         } else {
            if (train.speedCurrent === 0) train.setState(TrainState.WAITING_AT_SIGNAL, 0);
         }
      } else {
         const stoppingSignal = this.checkSignalsAhead(train);
         if (stoppingSignal) {
            train.setStoppedBySignal(stoppingSignal, SimulationConfig.trainLookaheadDistance - SimulationConfig.saftyDistanceFromSignal);
            this._eventManager.emit("trainStoppedBySignal", train, stoppingSignal);
         }
      }
   }

   checkSignalsAhead(train: Train): Signal | null {
      if (!train.position) throw new Error(`Train ${train.number} has no position`);

      const lookahead = SimulationConfig.trainLookaheadDistance;
      const dir = train.movingDirection;
      const endKm = train.position.km + lookahead * dir;

      try {
         const result = this._trackLayoutManager.followRailNetwork(train.position.track, train.position.km, lookahead * dir);

         const onCurrent = this.checkSignalsOnTrack(train.position.track, train.position.km, endKm, dir);
         if (onCurrent) return onCurrent;

         const nextTrack = result.element instanceof Track ? result.element : null;
         if (nextTrack && nextTrack !== train.position.track) {
            const nextStart = dir > 0 ? 0 : nextTrack.length;
            const onNext = this.checkSignalsOnTrack(nextTrack, nextStart, result.km, dir);
            if (onNext) return onNext;
         }
      } catch {
         // Dead end or invalid path
      }
      return null;
   }

   checkSignalsOnTrack(track: Track, startKm: number, endKm: number, direction: number): Signal | null {
      const minKm = Math.min(startKm, endKm);
      const maxKm = Math.max(startKm, endKm);

      for (const signal of track.signals) {
         if (signal.direction !== direction) continue;
         if (signal.position >= minKm && signal.position <= maxKm) {
            if (!signal.isTrainAllowedToGo()) {
               return signal;
            }
         }
      }
      return null;
   }

   checkSignalsPassed(
      train: Train,
      previousTrack: Track | null,
      previousKm: number,
      newTrack: Track,
      newKm: number
   ): void {
      if (!previousTrack) return;

      if (previousTrack === newTrack) {
         this.checkSignalsPassedOnTrack(train, previousTrack, previousKm, newKm);
      } else {
         const endKm = train.movingDirection > 0 ? previousTrack.length : 0;
         this.checkSignalsPassedOnTrack(train, previousTrack, previousKm, endKm);

         const startKm = train.movingDirection > 0 ? 0 : newTrack.length;
         this.checkSignalsPassedOnTrack(train, newTrack, startKm, newKm);
      }
   }

   checkSignalsPassedByTail(
      train: Train,
      previousTailTrack: Track | null,
      previousTailKm: number | null,
      newTailTrack: Track | null,
      newTailKm: number
   ): void {
      if (!previousTailTrack || previousTailKm === null || !newTailTrack) return;

      const checkOnTrack = (track: Track, startKm: number, endKm: number): void => {
         const passedSignals = track.signals
            .filter(signal => Tools.between(signal.position, startKm, endKm))
            .sort((a, b) => train.movingDirection > 0 ? a.position - b.position : b.position - a.position);

         for (const signal of passedSignals) {
            this._eventManager.emit("trainTailPassed", { track: signal.track, km: signal.position });
         }
      };

      if (previousTailTrack === newTailTrack) {
         checkOnTrack(previousTailTrack, previousTailKm, newTailKm);
      } else {
         const endKm = train.movingDirection > 0 ? previousTailTrack.length : 0;
         checkOnTrack(previousTailTrack, previousTailKm, endKm);

         const startKm = train.movingDirection > 0 ? 0 : newTailTrack.length;
         checkOnTrack(newTailTrack, startKm, newTailKm);
      }
   }

   private checkSignalsPassedOnTrack(train: Train, track: Track, startKm: number, endKm: number): void {
      const minKm = Math.min(startKm, endKm);
      const maxKm = Math.max(startKm, endKm);

      for (const signal of track.signals) {
         if (signal.direction !== train.movingDirection) continue;

         let signalPassed = false;
         if (train.movingDirection > 0) {
            signalPassed = signal.position > startKm && signal.position < endKm;
         } else {
            signalPassed = signal.position < startKm && signal.position > endKm;
         }

         if (signalPassed) {
            console.log(`Train ${train.number} passed signal at km ${signal.position} on track ${track.id}`);
            this._eventManager.emit("trainPassedSignal", train, signal);
         }
      }
   }
}

export default TrainSignalHandler;
