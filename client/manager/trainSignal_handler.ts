import Train from "../sim/train";
import Track from "../sim/track";
import Signal from "../sim/signal";
import { EventManager } from "./event_manager";
import { MovementException, RailSegment, TrackLayoutManager } from "./trackLayout_manager";
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

      const distance = SimulationConfig.trainLookaheadDistance * train.movingDirection;
      return this.firstStopSignal(train, this.segmentsAlong(train.position.track, train.position.km, distance));
   }

   passSignals(train: Train, segments: RailSegment[]): void {
      const dir = train.movingDirection;
      segments.forEach((segment, index) => {
         for (const signal of this.facingSignals(segment, dir, index > 0)) {
            this.emitTrainPassedSignal(train, signal);
         }
      });
   }

   private segmentsAlong(track: Track, km: number, distance: number): RailSegment[] {
      try {
         return this._trackLayoutManager.followRailNetwork(track, km, distance).segments;
      } catch (error) {
         if (error instanceof MovementException) return error.segments;
         return [];
      }
   }

   private firstStopSignal(train: Train, segments: RailSegment[]): SignalAhead | null {
      const dir = train.movingDirection;
      let traveled = 0;
      for (let i = 0; i < segments.length; i++) {
         const segment = segments[i];
         for (const signal of this.facingSignals(segment, dir, i > 0)) {
            if (train.hasClearedSignal(signal)) train.forgetClearedSignal(signal);
            if (!signal.isTrainAllowedToGo()) {
               return { signal, distance: traveled + Math.abs(signal.position - segment.fromKm) };
            }
         }
         traveled += Math.abs(segment.toKm - segment.fromKm);
      }
      return null;
   }

   private facingSignals(segment: RailSegment, direction: number, includeStart: boolean): Signal[] {
      const forward = direction > 0;
      const signals = segment.track.signals.filter(signal => {
         if (signal.direction !== direction) return false;
         if (forward) {
            const afterStart = includeStart ? signal.position >= segment.fromKm : signal.position > segment.fromKm;
            return afterStart && signal.position <= segment.toKm;
         }
         const afterStart = includeStart ? signal.position <= segment.fromKm : signal.position < segment.fromKm;
         return afterStart && signal.position >= segment.toKm;
      });
      if (!forward) signals.reverse();
      return signals;
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

   private emitTrainPassedSignal(train: Train, signal: Signal): void {
      if (train.hasClearedSignal(signal)) {
         if (signal.isTrainAllowedToGo()) this._eventManager.emit("trainPassedSignal", train, signal);
         return;
      }

      if (signal.isTrainAllowedToGo()) {
         train.markSignalCleared(signal);
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
