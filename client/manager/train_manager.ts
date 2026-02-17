import Train, { TrainStopReason } from "../sim/train";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import Signal from "../sim/signal";
import { EventManager } from "./event_manager";
import { TrackLayoutManager, MovementException } from "./trackLayout_manager";
import { SimulationConfig } from "../core/config";
import Tools from "../core/utils";
import { SignalRManager } from "../network/signalr";
import { ClientSimulation } from "../core/clientSimulation";
import { getTrainWaypoints } from "../network/api";

export class TrainManager {
   private _trains: Train[] = [];
   private _eventManager: EventManager;
   private _trackLayoutManager: TrackLayoutManager;
   private _signalRManager: SignalRManager;
   private _clientSimulation: ClientSimulation;

   constructor(
      eventManager: EventManager,
      trackLayoutManager: TrackLayoutManager,
      signalRManager: SignalRManager,
      clientSimulation: ClientSimulation
   ) {
      this._eventManager = eventManager;
      this._trackLayoutManager = trackLayoutManager;
      this._signalRManager = signalRManager;
      this._clientSimulation = clientSimulation;

      // Subscribe to train creation events
      this._eventManager.on("trainCreated", (train: Train, exitPointId: number) => {
         this.handleTrainCreated(train, exitPointId);
      });

      // Subscribe to simulation stop events
      this._eventManager.on("simulationStopped", () => {
         this.clearAllTrains();
      });
   }

   // ==================== SIMULATION METHODS ====================

   /**
    * Main simulation update loop - called by ClientSimulation on each tick
    */
   public updateSimulation(): void {
      // Update each train
      for (const train of this._trains) {
         this.updateTrain(train);
         this._eventManager.emit("trainUpdated", train);
      }
   }

   // Update a single train's position
   private updateTrain(train: Train): void {
      if (!train.position) throw new Error(`Train ${train.number} has no position`);
      if (train.isExiting) {
         this.updateExitingTrain(train);
         return;
      }
      if (Tools.is(train.stopReason, [TrainStopReason.COLLISION, TrainStopReason.EMERGENCY_STOP, TrainStopReason.DERAILEMENT, TrainStopReason.ENDED]))
         return;

      // Calculate movement distance based on elapsed time
      const movedDistance = train.getMovementDistance();

      if (this.checkTrainStoppedBySignal(train)) {
         return;
      }
      if (this.checkStationStop(train, movedDistance)) {
         return;
      }
      if (Math.abs(movedDistance) <= 0.001) {
         return;
      }


      // Use TrackLayoutManager to calculate new position
      try {
         const result = this._trackLayoutManager.followRailNetwork(train.position.track, train.position.km, movedDistance);

         // Check what type of element we got
         if (result.element instanceof Track) {
            // Store previous position before updating
            const previousTrack = train.position.track;
            const previousKm = train.position.km;
            const previousTailTrack = train.tailPosition?.track;
            const previousTailKm = train.tailPosition?.km ?? null;

            train.setPosition(result.element, result.km);

            // Calculate and update tail position
            const tailUpdated = this.updateTailPosition(train);
            if (!tailUpdated) {
               //if the tail position update fails, the train is derailed
               console.warn(`Train ${train.number} derailed at switch ${result.element.id}`);
               this._eventManager.emit("trainDerailed", train, result.element);
               train.setStopReason(TrainStopReason.DERAILEMENT);
               return;
            }

            const blockingTrain = this.detectTrainCollision(train);
            if (blockingTrain) {
               this._eventManager.emit("trainCollision", train, blockingTrain);
               train.setStopReason(TrainStopReason.COLLISION);
               blockingTrain.setStopReason(TrainStopReason.COLLISION);
               return;
            }

            // Check if tail passed any signals during this movement
            this.checkSignalsPassedByTail(train, previousTailTrack ?? null, previousTailKm, train.tailPosition?.track ?? null, train.tailPosition?.km ?? 0);

            // Check if tail track element changed and emit tail pass event
            if (train.tailPosition?.track !== previousTailTrack) {
               this._eventManager.emit("trainTailPassed", { track: previousTailTrack });
            }

            // Check if train passed any signals during this movement
            this.checkSignalsPassed(train, previousTrack, previousKm, result.element, result.km);

            return; // Train was updated
         } else if (result.element instanceof Exit) {
            // Train reached exit - begin staged despawn and report when fully cleared
            const exit = result.element;
            console.log(`Train ${train.number} reached exit ${exit.id}`);
            const boundaryKm = train.movingDirection > 0 ? train.position.track.length : 0;
            train.setPosition(train.position.track, boundaryKm);
            train.startExiting(exit.id, boundaryKm);
            this.updateTailPosition(train);
            return;
         } else if (result.element instanceof Switch) {
            // Train stopped at switch (wrong direction/position) - clear signal reference            
            console.log(`Train ${train.number} stopped at switch ${result.element.id}`);
            this._eventManager.emit("trainDerailed", train, result.element);
            train.setStopReason(TrainStopReason.DERAILEMENT);
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

   private checkTrainStoppedBySignal(train: Train): boolean {
      if (train.stoppedBySignal !== null) {
         if (train.stoppedBySignal.isTrainAllowedToGo()) {
            train.setStoppedBySignal(null);
            // Check if train has already completed its scheduled wait at this station
            // (e.g., was waiting for signal after scheduled departure time)
            if (train.waitingProgress === 1) {
               // Train has already completed its scheduled wait - allow it to depart
               train.setStopReason(TrainStopReason.NONE);
               this._eventManager.emit("trainDepartedFromStation", train);
               return false;
            }
            return false;
         } else {
            return true;
         }
      } else {
         const stoppingSignal = this.checkSignalsAhead(train);
         if (stoppingSignal) {
            // Signal is red - stop the train and store the signal reference
            train.setStoppedBySignal(stoppingSignal);
            this._eventManager.emit("trainStoppedBySignal", train, stoppingSignal);
            return true;
         }
      }
      return false;
   }

   // Check for signals ahead of the train that would stop it
   private checkSignalsAhead(train: Train): Signal | null {
      if (!train.position) throw new Error(`Train ${train.number} has no position`);

      const lookahead = SimulationConfig.signalLookaheadDistance;
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
         // Dead end or invalid path - no signals to worry about
      }
      return null;
   }

   // Check for stopping signals on a specific track segment
   private checkSignalsOnTrack(track: Track, startKm: number, endKm: number, direction: number): Signal | null {
      // Ensure startKm <= endKm for comparison
      const minKm = Math.min(startKm, endKm);
      const maxKm = Math.max(startKm, endKm);

      for (const signal of track.signals) {
         // Check if signal is in the correct direction for this train
         if (signal.direction !== direction) {
            continue; // Signal doesn't apply to this direction
         }

         // Check if signal is within the lookahead range
         if (signal.position >= minKm && signal.position <= maxKm) {
            // Check if signal is set to stop (red)
            if (!signal.isTrainAllowedToGo()) {
               return signal; // Found a stopping signal
            }
         }
      }

      return null; // No stopping signals found
   }

   // Check if train passed any signals during movement and emit events
   private checkSignalsPassed(
      train: Train,
      previousTrack: Track | null,
      previousKm: number,
      newTrack: Track,
      newKm: number
   ): void {
      if (!previousTrack) {
         return; // No previous position to compare
      }

      // Check signals on the previous track (if train was moving along it)
      if (previousTrack === newTrack) {
         // Train stayed on same track - check for passed signals
         this.checkSignalsPassedOnTrack(train, previousTrack, previousKm, newKm);
      } else {
         // Train moved to different track - check both tracks

         // Check remaining signals on previous track (from previous position to end)
         const endKm = train.movingDirection > 0 ? previousTrack.length : 0;
         this.checkSignalsPassedOnTrack(train, previousTrack, previousKm, endKm);

         // Check signals on new track (from start to new position)
         const startKm = train.movingDirection > 0 ? 0 : newTrack.length;
         this.checkSignalsPassedOnTrack(train, newTrack, startKm, newKm);
      }
   }

   // Check if train tail passed any signals during movement and emit events
   private checkSignalsPassedByTail(
      train: Train,
      previousTailTrack: Track | null,
      previousTailKm: number | null,
      newTailTrack: Track | null,
      newTailKm: number
   ): void {
      if (!previousTailTrack || previousTailKm === null || !newTailTrack) {
         return;
      }

      const checkSignalsPassedOnTrackAnyDirection = (track: Track, startKm: number, endKm: number): void => {
         const passedSignals = track.signals
            .filter(signal => Tools.between(signal.position, startKm, endKm))
            .sort((a, b) => train.movingDirection > 0 ? a.position - b.position : b.position - a.position);

         for (const signal of passedSignals) {
            this._eventManager.emit("trainTailPassed", { track: signal.track, km: signal.position });
         }
      };

      // if we are still on the same track, check for passed signals on the track
      if (previousTailTrack === newTailTrack) {
         checkSignalsPassedOnTrackAnyDirection(previousTailTrack, previousTailKm, newTailKm);
      } else {
         // if we are on a different track, check for passed signals on the previous track and the new track
         const endKm = train.movingDirection > 0 ? previousTailTrack.length : 0;
         checkSignalsPassedOnTrackAnyDirection(previousTailTrack, previousTailKm, endKm);

         const startKm = train.movingDirection > 0 ? 0 : newTailTrack.length;
         checkSignalsPassedOnTrackAnyDirection(newTailTrack, startKm, newTailKm);
      }
   }

   // Check for passed signals on a specific track segment
   private checkSignalsPassedOnTrack(train: Train, track: Track, startKm: number, endKm: number): void {
      // Ensure proper order for comparison
      const minKm = Math.min(startKm, endKm);
      const maxKm = Math.max(startKm, endKm);

      for (const signal of track.signals) {
         // Check if signal is in the correct direction for this train
         if (signal.direction !== train.movingDirection) {
            continue; // Signal doesn't apply to this direction
         }

         // Check if train passed this signal during the movement
         let signalPassed = false;

         if (train.movingDirection > 0) {
            // Passed only when strictly past - not when landing exactly on (would set red while still at signal)
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



   // Determine if another train blocks the proposed movement on the same track
   private detectTrainCollision(train: Train): Train | null {
      const currentTrack = train.position?.track;
      if (!currentTrack) return null;

      for (const other of this._trains) {
         if (other === train || other.tailPosition === null || other.position === null) continue;
         if (other.tailPosition.track !== currentTrack) continue; // minimal same-track collision check

         // Other train occupies space between its tail and front (position)
         const otherTrainFront = other.position.km;
         const otherTrainBack = other.tailPosition.km;

         if (Tools.between(train.position.km, otherTrainBack, otherTrainFront)) return other;
      }

      return null;
   }

   // ==================== TRAIN MANAGEMENT METHODS ====================

   // Add a new train to the manager at a specific exit point
   spawnTrainAtExitPoint(train: Train, exitPointId: number): void {
      // Get the track and kilometer position for this exit point
      const location = this._trackLayoutManager.getExitPointLocation(exitPointId);
      const direction = this._trackLayoutManager.getExitPointDirection(exitPointId);
      if (location.track) {
         // Set the train's position (always the front)
         train.setPosition(location.track, location.km);
         train.setMovingDirection(direction);
         train.setDrawingDirection(-direction);

         // Initialize tail position
         this.updateTailPosition(train);

         console.log(
            `Train ${train.number} positioned on track ${location.track.id} at km ${location.km} with direction ${direction}`
         );
      } else {
         console.error(`Could not find track for exit point ${exitPointId}`);
      }

      this._trains.push(train);

      // Emit train added event for other components
      this._eventManager.emit("trainAdded", train);
   }

   public spawnLocalTestTrain(): Train | null {
      const track = this._trackLayoutManager.tracks.find(t => t.id === 183);
      if (!track) {
         console.warn("TrainManager: Cannot spawn local test train - no tracks loaded");
         return null;
      }

      const trainNumber = this.generateUniqueTestTrainNumber();
      const train = new Train(trainNumber, 3, 100);
      const direction = 1;
      train.setDrawingDirection(direction);
      const km = 212;
      train.setPosition(track, km);
      train.setMovingDirection(direction);
      this.updateTailPosition(train);
      this._eventManager.emit("trainAdded", train);
      this._trains.push(train);
      return train;
   }

   // Remove a train from the manager
   removeTrain(trainNumber: string): boolean {
      const index = this._trains.findIndex((train) => train.number === trainNumber);
      if (index !== -1) {
         const removedTrain = this._trains.splice(index, 1)[0];
         return true;
      }
      return false;
   }

   // Get a train by number
   getTrain(trainNumber: string): Train | undefined {
      return this._trains.find((train) => train.number === trainNumber);
   }

   public reverseTrain(trainNumber: string): boolean {
      const train = this.getTrain(trainNumber);
      if (!train || !train.position || !train.tailPosition) return false;

      // Swap position and tailPosition (front becomes back, back becomes front)
      const tempTrack = train.position.track;
      const tempKm = train.position.km;
      train.setPosition(train.tailPosition.track, train.tailPosition.km);
      train.setTailPosition(tempTrack, tempKm);

      // Reverse moving direction
      train.setMovingDirection(train.movingDirection * -1);

      return true;
   }

   // Get all trains
   getAllTrains(): Train[] {
      return this._trains;
   }

   // Clear all trains
   clearAllTrains(): void {
      this._trains = [];
      this._eventManager.emit("trainsUpdated");
   }

   private generateUniqueTestTrainNumber(): string {
      let i = 1;
      while (true) {
         const candidate = `TEST-${i}`;
         if (!this._trains.some((train) => train.number === candidate)) return candidate;
         i++;
      }
   }

   // Handle train creation events
   private handleTrainCreated(train: Train, exitPointId: number): void {
      console.log(`TrainManager: Received train ${train.getInfo()}`);
      this.spawnTrainAtExitPoint(train, exitPointId);
   }

   // Calculate and update the tail position of a train
   // Returns true if the tail position was updated, false if the calculation hits a switch which means the train is derailed
   private updateTailPosition(train: Train, trainLengthOverride: number | null = null): boolean {
      if (!train.position) throw new Error(`Train ${train.number} has no position`);
      const trainLength = trainLengthOverride ?? train.getLength();
      if (trainLength <= 0) {
         train.setTailPosition(train.position.track, train.position.km);
         return true;
      }

      // Calculate tail position: tail is always behind the front (position)
      // "Behind" means opposite to the direction of movement
      // movingDirection = 1 (increasing km): tail is at lower km (negative offset)
      // movingDirection = -1 (decreasing km): tail is at higher km (positive offset)
      const tailOffset = -trainLength * train.movingDirection;

      try {
         const tailResult = this._trackLayoutManager.followRailNetwork(train.position.track, train.position.km, tailOffset);

         // Tail can only be on a Track (switches and exits don't have dimensions)
         if (tailResult.element instanceof Track) {
            train.setTailPosition(tailResult.element, tailResult.km);
            return true;
         } else if (tailResult.element instanceof Switch) {
            return false;
         } else if (tailResult.element instanceof Exit) {
            // If tail calculation hits an exit, keep tail at the exit boundary on that exit's track.
            // This happens while the train is spawning and the tail is still outside the layout.
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
         // If we can't calculate tail position (e.g., train is at a dead end),
         // set tail to same as head
         train.setTailPosition(train.position?.track, train.position?.km);
         return true;
      }
   }

   private updateExitingTrain(train: Train): void {
      if (!train.position || train.exitBoundaryKm === null) return;

      const movedDistance = Math.abs(train.getMovementDistance());
      if (movedDistance <= 0.001) return;

      const previousTailTrack = train.tailPosition?.track ?? null;
      const previousTailKm = train.tailPosition?.km ?? null;

      train.advanceExitProgress(movedDistance);
      const remainingLength = Math.max(0, train.getLength() - train.exitProgressMeters);

      // Keep train head fixed at the exit boundary while the remaining cars leave the layout.
      train.setPosition(train.position.track, train.exitBoundaryKm);
      this.updateTailPosition(train, remainingLength);

      this.checkSignalsPassedByTail(
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
         this.removeTrain(train.number);
      }
   }

   // Handle train ending and transforming into a following train
   private async handleTrainEnding(train: Train): Promise<void> {
      const oldNumber = train.number;
      const followingTrainNumber = train.followingTrainNumber;

      if (!followingTrainNumber) {
         console.warn(`Train ${oldNumber} has action 'End' but no following train number`);
         return;
      }

      try {
         // Fetch waypoints for the following train
         const waypoints = await getTrainWaypoints(followingTrainNumber);

         if (waypoints.length < 1) {
            console.error(`Following train ${followingTrainNumber} has no waypoints`);
            return;
         }

         const firstWaypoint = waypoints[0];
         const secondWaypoint = waypoints.length > 1 ? waypoints[1] : null;

         // Determine new moving direction if we have a second waypoint
         let newDirection = train.movingDirection; // Default to current direction
         if (secondWaypoint) {
            const exit = this._trackLayoutManager.findExitToStation(secondWaypoint.station);
            if (exit) {
               // getExitPointDirection returns the spawn direction (moving away from exit)
               // We need the opposite direction to move toward the exit
               const exitSpawnDirection = this._trackLayoutManager.getExitPointDirection(exit.id);
               newDirection = -exitSpawnDirection;
               console.log(`Train ${oldNumber} will head to ${secondWaypoint.station} via exit ${exit.id} in direction ${newDirection}`);
            } else {
               console.warn(`No exit found to station ${secondWaypoint.station}, keeping current direction`);
            }
         } else {
            console.warn(`Following train ${followingTrainNumber} has only one waypoint, cannot determine direction`);
         }

         // Update train to become the following train
         train.number = followingTrainNumber;
         train.setScheduleTimes(new Date(firstWaypoint.arrivalTime), new Date(firstWaypoint.departureTime));
         train.action = firstWaypoint.action as any;

         // If direction changed, reverse the train (swap positions and toggle moving direction)
         if (newDirection !== train.movingDirection) {
            this.reverseTrain(followingTrainNumber);
         }

         // Reset station stop tracking
         train.setStationStopStartTime(this._clientSimulation.currentSimulationTime);
         train.setStopReason(TrainStopReason.STATION);
         train.setWaitingProgress(0);

         console.log(`Train ${oldNumber} transformed into ${followingTrainNumber} at station, new direction: ${newDirection}`);

         // Emit event for UI updates
         this._eventManager.emit('trainTransformed', train, oldNumber, followingTrainNumber);

      } catch (error) {
         console.error(`Failed to fetch waypoints for following train ${followingTrainNumber}:`, error);
         // Keep train stopped at station if we can't fetch the new timetable
      }
   }

   // Check if train should stop at a station or depart based on schedule
   // returns true if train should stop at a station or is already stopped, false if it should depart or it is not near the station
   private checkStationStop(train: Train, proposedDistance: number): boolean {
      const currentSimulationTime = this._clientSimulation.currentSimulationTime!;

      // Early return if no station stop needed
      if (!train.shouldStopAtCurrentStation || !train.position!.track.halt) {
         return false;
      }
      // Check if train is already stopped at this station
      if (train.stopReason === TrainStopReason.STATION) {
         // Train is already stopped - check if it's time to depart
         if (train.departureTime && currentSimulationTime >= train.departureTime) {
            // Check if the next signal allows departure (from the front)
            train.setWaitingProgress(1);

            const nextSignal = this._trackLayoutManager.getNextSignal(train.position!.track, train.position!.km, train.movingDirection);
            if (nextSignal && !nextSignal.isTrainAllowedToGo()) {
               train.setStoppedBySignal(nextSignal);
               this._eventManager.emit("trainStoppedBySignal", train, nextSignal);
               return true; // Signal is red, cannot depart 
            }

            train.setStopReason(TrainStopReason.NONE);
            this._eventManager.emit("trainDepartedFromStation", train);
            return false;
         }
         // While waiting, update progress relative to departure time

         if (train.departureTime && train.stationStopStartTime) {
            const totalMs = Math.max(1, train.departureTime.getTime() - train.stationStopStartTime.getTime());
            const elapsedMs = currentSimulationTime.getTime() - train.stationStopStartTime.getTime();
            train.setWaitingProgress(elapsedMs / totalMs);
         }
         return true; // Train is stopped but not time to depart yet
      }

      // if the train already called at the station, don't stop it again     
      if(train.waitingProgress ===1 ) return false;

      // Train is not stopped - check if it needs to stop (only calculate distance if needed)
      // Calculate the center of the train (midpoint between head and tail)
      // Note: Both head and tail should be on the same track when near a station
      if (!train.position || !train.tailPosition || train.position.track !== train.tailPosition.track) {
         return false; // Can't check station stop if train spans multiple tracks
      }

      const trainCenterKm = (train.position.km + train.tailPosition.km) / 2;
      const trackCenter = train.position.track.length / 2;
      const distanceFromCenter = Math.abs(trainCenterKm - trackCenter);
      const isNearStation = distanceFromCenter <= Math.abs(proposedDistance) + 0.1;

      if (isNearStation) {
         // Check if train ends here and transforms into a following train
         if (train.action === 'End' && train.followingTrainNumber) {
            // Handle train ending asynchronously (don't await to avoid blocking simulation)
            void this.handleTrainEnding(train);

            // Stop the train at the station while transformation is in progress
            train.setStopReason(TrainStopReason.ENDED);
            this._eventManager.emit("trainStoppedAtStation", train);
            return true;
         }

         // Train is arriving and near the station - stop it
         if (train.arrivalTime && train.departureTime && currentSimulationTime > train.arrivalTime) {
            var departureTime = new Date(currentSimulationTime.getTime() + SimulationConfig.stationMinStopTime * 1000);
            if (departureTime < train.departureTime) {
               departureTime = train.departureTime;
            }
            train.setScheduleTimes(train.arrivalTime, departureTime);
         }


         train.setStopReason(TrainStopReason.STATION);
         // Mark the start of the station stop if not already set, and reset progress
         if (!train.stationStopStartTime) {
            train.setStationStopStartTime(new Date(currentSimulationTime));
         }
         this._eventManager.emit("trainStoppedAtStation", train);
         return true;
      }

      return false; // Train is not near the station
   }
}

export default TrainManager;