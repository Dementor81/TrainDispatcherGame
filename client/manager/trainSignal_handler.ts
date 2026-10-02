import Train from "../sim/train";
import Track from "../sim/track";
import Signal from "../sim/signal";
import { EventManager } from "./event_manager";
import { TrackLayoutManager } from "./trackLayout_manager";
import { SimulationConfig } from "../core/config";
import Tools from "../core/utils";
import { TrainState } from "../sim/train";

type SignalAhead = { signal: Signal; distance: number };

export class TrainSignalHandler {
   private _trackLayoutManager: TrackLayoutManager;
   private _eventManager: EventManager;

   constructor(trackLayoutManager: TrackLayoutManager, eventManager: EventManager) {
      this._trackLayoutManager = trackLayoutManager;
      this._eventManager = eventManager;
   }

   checkTrainStoppedBySignal(train: Train): void {
      if (train.state === TrainState.MANUAL_CONTROL || train.state === TrainState.WAITING_FOR_NEXT_SERVICE || train.state === TrainState.DUE_FOR_NEXT_SERVICE) return;
      if (Train.isAwaitingAcknowledgement(train.state)) return;

      if (train.stoppedBySignal !== null) {
         if (train.stoppedBySignal.isTrainAllowedToGo()) {
            train.setStoppedBySignal(null);
            this._eventManager.emit("trainContinuedAfterSignalStop", train);
            if (train.waitingProgress === 1) {
               train.setState(TrainState.RUNNING);
               this._eventManager.emit("trainDepartedFromStation", train);
               return;
            }
         }
         return;
      }

      if (train.stoppedByEndOfTrack) {
         if (train.state === TrainState.BRAKING_FOR_SIGNAL || train.state === TrainState.WAITING_AT_SIGNAL) return;
      }

      const ahead = this.checkSignalsAhead(train);
      if (ahead) {
         this.applyRedSignalStop(train, ahead);
         return;
      }

      this.checkEndOfTrackAhead(train);
   }

   private applyRedSignalStop(train: Train, ahead: SignalAhead): void {
      const available = ahead.distance - SimulationConfig.saftyDistanceFromSignal;
      const required = (train.speedCurrent * train.speedCurrent) / (2 * SimulationConfig.trainAcceleration);
      const alreadyStopped = train.speedCurrent <= 0.05;
      if (!alreadyStopped && (available <= 0 || required > available)) {
         train.enterEmergencyForSignal(ahead.signal);
         this._eventManager.emit("trainStoppedBySignal", train, ahead.signal);
         return;
      }

      train.setStoppedBySignal(ahead.signal, Math.max(0, available));
      this._eventManager.emit("trainStoppedBySignal", train, ahead.signal);
   }

   private shouldSkipBumperLookahead(train: Train): boolean {
      if (train.isStationState()) return true;
      return train.shouldStopAtCurrentStation && !!train.position?.track.halt;
   }

   private checkEndOfTrackAhead(train: Train): void {
      if (this.shouldSkipBumperLookahead(train)) return;
      if (!train.position) return;

      const bumperDist = this._trackLayoutManager.distanceToDeadEnd(
         train.position.track,
         train.position.km,
         train.movingDirection,
         SimulationConfig.trainLookaheadDistance
      );
      if (bumperDist === null) return;

      if (bumperDist <= 0) {
         train.setState(TrainState.MISROUTED, 0);
         this._eventManager.emit("trainMisrouted", train);
         return;
      }

      train.setStoppedByEndOfTrack(bumperDist);
   }

   checkSignalsAhead(train: Train): SignalAhead | null {
      if (!train.position) throw new Error(`Train ${train.number} has no position`);

      const lookahead = SimulationConfig.trainLookaheadDistance;
      const dir = train.movingDirection;
      const endKm = train.position.km + lookahead * dir;

      const onCurrent = this.findClosestRedSignal(train.position.track, train.position.km, endKm, dir);
      if (onCurrent) return onCurrent;

      try {
         const result = this._trackLayoutManager.followRailNetwork(train.position.track, train.position.km, lookahead * dir);

         const nextTrack = result.element instanceof Track ? result.element : null;
         if (nextTrack && nextTrack !== train.position.track) {
            const toEndOfCurrent = dir > 0
               ? train.position.track.length - train.position.km
               : train.position.km;
            const nextStart = dir > 0 ? 0 : nextTrack.length;
            const onNext = this.findClosestRedSignal(nextTrack, nextStart, result.km, dir);
            if (onNext) return { signal: onNext.signal, distance: toEndOfCurrent + onNext.distance };
         }
      } catch {
         // Dead end or invalid path
      }
      return null;
   }

   private findClosestRedSignal(track: Track, startKm: number, endKm: number, direction: number): SignalAhead | null {
      const minKm = Math.min(startKm, endKm);
      const maxKm = Math.max(startKm, endKm);
      let closest: SignalAhead | null = null;

      for (const signal of track.signals) {
         if (signal.direction !== direction) continue;
         if (signal.position < minKm || signal.position > maxKm) continue;
         if (signal.isTrainAllowedToGo()) continue;
         const distance = Math.abs(signal.position - startKm);
         if (!closest || distance < closest.distance) closest = { signal, distance };
      }
      return closest;
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

   enforceSignalsBehindHead(train: Train): void {
      const position = train.position;
      if (!position) return;

      const dir = train.movingDirection;
      for (const signal of position.track.signals) {
         if (signal.direction !== dir || !signal.state) continue;
         const passed = dir > 0
            ? position.km >= signal.position
            : position.km <= signal.position;
         if (passed) this.emitTrainPassedSignal(train, signal);
      }
   }

   private checkSignalsPassedOnTrack(train: Train, track: Track, startKm: number, endKm: number): void {
      for (const signal of track.signals) {
         if (signal.direction !== train.movingDirection) continue;

         const signalPassed = train.movingDirection > 0
            ? signal.position > startKm && signal.position <= endKm
            : signal.position < startKm && signal.position >= endKm;

         if (signalPassed) this.emitTrainPassedSignal(train, signal);
      }
   }

   private emitTrainPassedSignal(train: Train, signal: Signal): void {
      if (signal.state) {
         console.log(`Train ${train.number} passed signal at km ${signal.position} on track ${signal.track?.id}`);
         this._eventManager.emit("trainPassedSignal", train, signal);
         return;
      }

      if (train.state === TrainState.MANUAL_CONTROL) return;
      if (train.state === TrainState.PASSED_RED_SIGNAL) return;

      train.enterPassedRedSignal();
      this._eventManager.emit("trainPassedRedSignal", train, signal);
   }
}

export default TrainSignalHandler;
