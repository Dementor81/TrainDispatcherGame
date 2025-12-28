import Train, { TrainStopReason } from "../sim/train";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import Signal from "../sim/signal";
import { EventManager } from "./event_manager";
import { TrackLayoutManager, MovementException } from "./trackLayout_manager";
import { SimulationConfig } from "../core/config";
import { getSimulationStatus } from "../network/api";
import Tools from "../core/utils";

export class TrainManager {
   private _trains: Train[] = [];
   private _eventManager: EventManager;
   private _trackLayoutManager: TrackLayoutManager;
   // Simulation properties
   private _simulationTimer: NodeJS.Timeout | null = null;
   private _timerWorker: Worker | null = null;
   private _isSimulationRunning: boolean = false;
   private _currentSimulationTime: Date | null = null; // Current simulation time from server
   private _lastSimulationTimeUpdate: number = 0; // When we last updated simulation time

   public get currentSimulationTime(): Date | null {
      return this._currentSimulationTime;
   }

   constructor(eventManager: EventManager, trackLayoutManager: TrackLayoutManager) {
      this._eventManager = eventManager;
      this._trackLayoutManager = trackLayoutManager;

      // Subscribe to train creation events
      this._eventManager.on("trainCreated", (train: Train, exitPointId: number) => {
         this.handleTrainCreated(train, exitPointId);
      });

      // Subscribe to train reached exit events to handle sending back to server
      this._eventManager.on("trainReachedExit", (train: Train, exit: Exit) => {
         this.handleTrainReachedExit(train, exit);
      });
   }

   // ==================== SIMULATION METHODS ====================

   // Start the simulation
   startSimulation(): void {
      if (this._isSimulationRunning) {
         console.log("Simulation is already running");
         return;
      }

      this.resumeSimulation();

      console.log("Train simulation started");
      this._eventManager.emit("simulationStarted");
   }

   // Stop the simulation
   stopSimulation(): void {
      if (!this._isSimulationRunning) {
         console.log("Simulation is not running");
         return;
      }

      this.pauseSimulation();

      this._trains = [];

      this._eventManager.emit("trainsUpdated", this._trains);

      console.log("Train simulation stopped");
      this._eventManager.emit("simulationStopped");
   }

   pauseSimulation(): void {
      this._isSimulationRunning = false;
      if (this._simulationTimer) {
         clearInterval(this._simulationTimer);
         this._simulationTimer = null;
      }
      if (this._timerWorker) {
         try {
            this._timerWorker.postMessage({ type: "stop" });
            this._timerWorker.terminate();
         } catch {}
         this._timerWorker = null;
      }
   }

   resumeSimulation(): void {
      if (this._isSimulationRunning) {
         console.log("Simulation is already running");
         return;
      }
      this._isSimulationRunning = true;

      const intervalMs = SimulationConfig.simulationIntervalSeconds * 1000;
      // Prefer Web Worker-based timer; fall back to setInterval if creation fails
      try {
         // new URL with import.meta.url lets Webpack bundle the worker
         this._timerWorker = new Worker(new URL("../core/simulationTimer.worker.ts", import.meta.url), { type: "module" } as any);
         this._timerWorker.onmessage = (evt: MessageEvent<any>) => {
            if (!this._isSimulationRunning) return;
            // Could compute delta time here using evt.data.now if we later switch to dt-based movement
            this.updateSimulation();
         };
         this._timerWorker.postMessage({ type: "start", intervalMs });
      } catch (err) {
         console.warn("Worker timer unavailable, falling back to setInterval", err);
         this._simulationTimer = setInterval(() => {
            this.updateSimulation();
         }, intervalMs);
      }
   }

   // Check if simulation is running
   isSimulationRunning(): boolean {
      return this._isSimulationRunning;
   }

   // Client uses SimulationConfig.simulationSpeed globally; no internal copy

   // Get current simulation time from server (with caching)
   private async getCurrentSimulationTime(): Promise<Date> {
      const now = Date.now();

      // Cache simulation time for 1 second to avoid too many API calls
      if (!this._currentSimulationTime || now - this._lastSimulationTimeUpdate > 1000) {
         try {
            const status = await getSimulationStatus();
            this._currentSimulationTime = new Date(status.currentTime);
            this._lastSimulationTimeUpdate = now;
         } catch (error) {
            console.warn("Failed to get simulation time from server, using real time:", error);
            this._currentSimulationTime = new Date();
         }
      }

      return this._currentSimulationTime;
   }

   // Main simulation update loop
   private updateSimulation(): void {
      this.getCurrentSimulationTime().catch((error) => {
         console.warn("Failed to update simulation time:", error);
      });

      if (this._trains.length === 0) {
         return; // No trains to update
      }

      let trainsUpdated = false;

      // Update each train
      for (const train of this._trains) {
         if (this.updateTrain(train)) {
            trainsUpdated = true;
         }
      }

      // Trigger render update if any trains were updated
      if (true) {
         this._eventManager.emit("trainsUpdated", this._trains);
      }
   }

   // Update a single train's position
   private updateTrain(train: Train): boolean {
      if (!train.position) {
         throw new Error(`Train ${train.number} has no position`);
      }

      if(train.stopReason === TrainStopReason.COLLISION || train.stopReason === TrainStopReason.EMERGENCY_STOP) {
         return false;
      }

      // Calculate movement distance based on elapsed time
      const proposedDistance = train.getMovementDistance();

      if (train.stoppedBySignal !== null) {
         if (train.stoppedBySignal.isTrainAllowedToGo()) {
            train.setStoppedBySignal(null);
         } else {
            return false;
         }
      } else {
         const stoppingSignal = this.checkSignalsAhead(train);
         if (stoppingSignal) {
            // Signal is red - stop the train and store the signal reference
            train.setStoppedBySignal(stoppingSignal);
            console.log(`Train ${train.number} stopped by signal at km ${stoppingSignal.position} on track ${train.position?.track.id}`);
            this._eventManager.emit("trainStoppedBySignal", train, stoppingSignal);
            return false;
         }
      }

      if (this.checkStationStop(train, proposedDistance)) {
         return false;
      }
      if (Math.abs(proposedDistance) <= 0.001) {
         return false;
      }
      const movedDistance = proposedDistance;

      // Use TrackLayoutManager to calculate new position
      try {
         const result = this._trackLayoutManager.followRailNetwork(train.position.track, train.position.km, movedDistance);

         // Check what type of element we got
         if (result.element instanceof Track) {
            // Store previous position before updating
            const previousTrack = train.position.track;
            const previousKm = train.position.km;
            const previousTailTrack = train.tailPosition?.track;

            // Normal movement - update train position
            train.setPosition(result.element, result.km);
            train.setDirection(result.direction);

            // Calculate and update tail position
            const tailUpdated = this.updateTailPosition(train);
            if (!tailUpdated) {
               //if the tail position update fails, the train is derailed
               console.warn(`Train ${train.number} derailed at switch ${result.element.id}`);
               this._eventManager.emit("trainDerailed", train, result.element);
               this.removeTrain(train.number);
               return false;
            }

            const blockingTrain = this.detectTrainCollision(train);
            if (blockingTrain) {               
               this._eventManager.emit("trainCollision", train, blockingTrain);
               train.setStopReason(TrainStopReason.COLLISION);
               blockingTrain.setStopReason(TrainStopReason.COLLISION);
               return false;
            }

            // Check if tail track element changed and emit occupiedTrackCleared event
            if (previousTailTrack instanceof Track && train.tailPosition?.track !== previousTailTrack) {
               this._eventManager.emit("occupiedTrackCleared", previousTailTrack, train);
            }

            // Check if train passed any signals during this movement
            this.checkSignalsPassed(train, previousTrack, previousKm, result.element, result.km);

            return true; // Train was updated
         } else if (result.element instanceof Exit) {
            // Train reached exit - emit occupiedTrackCleared for tail track before removing train
            const exit = result.element;
            console.log(`Train ${train.number} reached exit ${exit.id}`);

            // Emit occupiedTrackCleared for the tail track so routes can be updated
            if (train.tailPosition) {
               this._eventManager.emit("occupiedTrackCleared", train.tailPosition.track, train);
            }

            this.removeTrain(train.number);
            this._eventManager.emit("sendTrainToServer", train.number, exit.id);
            return false;
         } else if (result.element instanceof Switch) {
            // Train stopped at switch (wrong direction/position) - clear signal reference
            train.setStoppedBySignal(null);

            console.log(`Train ${train.number} stopped at switch ${result.element.id}`);
            this._eventManager.emit("trainStoppedAtSwitch", train, result.element);
            return false;
         } else {
            // Unknown element type - clear signal reference
            train.setStoppedBySignal(null);

            console.log(`Train ${train.number} encountered unknown element`);
            this._eventManager.emit("trainStopped", train, result);
            return false;
         }
      } catch (error) {
         // Movement blocked by actual error (invalid track, zero distance, etc.)
         train.setStoppedBySignal(null); // Clear signal reference for error stops

         this.handleMovementException(train, error);
         return false;
      }
   }

   // Check for signals ahead of the train that would stop it
   private checkSignalsAhead(train: Train): Signal | null {
      if (!train.position) {
         throw new Error(`Train ${train.number} has no position`);
      }

      // Total distance to look ahead: movement distance + lookahead distance
      const totalLookaheadDistance = SimulationConfig.signalLookaheadDistance;

      try {
         // Use followRailNetwork to trace the path ahead
         const result = this._trackLayoutManager.followRailNetwork(
            train.position.track,
            train.position.km,
            totalLookaheadDistance * train.direction
         );

         // Check for signals on the current track first
         const currentTrackSignals = this.checkSignalsOnTrack(
            train.position.track,
            train.position.km,
            train.position.km + totalLookaheadDistance * train.direction,
            train.direction
         );

         if (currentTrackSignals) {
            return currentTrackSignals;
         }

         // If we moved to a different track, check signals on that track too
         if (result.element instanceof Track && result.element !== train.position?.track) {
            const nextTrackSignals = this.checkSignalsOnTrack(
               result.element,
               result.element === train.position?.track ? train.position.km : train.direction > 0 ? 0 : result.element.length,
               result.km,
               train.direction
            );

            if (nextTrackSignals) {
               return nextTrackSignals;
            }
         }
      } catch (error) {
         // If we can't trace ahead (dead end, etc.), no signals to worry about
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
         const endKm = train.direction > 0 ? previousTrack.length : 0;
         this.checkSignalsPassedOnTrack(train, previousTrack, previousKm, endKm);

         // Check signals on new track (from start to new position)
         const startKm = train.direction > 0 ? 0 : newTrack.length;
         this.checkSignalsPassedOnTrack(train, newTrack, startKm, newKm);
      }
   }

   // Check for passed signals on a specific track segment
   private checkSignalsPassedOnTrack(train: Train, track: Track, startKm: number, endKm: number): void {
      // Ensure proper order for comparison
      const minKm = Math.min(startKm, endKm);
      const maxKm = Math.max(startKm, endKm);

      for (const signal of track.signals) {
         // Check if signal is in the correct direction for this train
         if (signal.direction !== train.direction) {
            continue; // Signal doesn't apply to this direction
         }

         // Check if train passed this signal during the movement
         let signalPassed = false;

         if (train.direction > 0) {
            // Moving forward: passed if signal is between start and end positions
            signalPassed = signal.position > startKm && signal.position <= endKm;
         } else {
            // Moving backward: passed if signal is between end and start positions
            signalPassed = signal.position < startKm && signal.position >= endKm;
         }

         if (signalPassed) {
            console.log(`Train ${train.number} passed signal at km ${signal.position} on track ${track.id}`);
            // Emit event for signal passed
            this._eventManager.emit("trainPassedSignal", train, signal);
         }
      }
   }

   // Handle movement exceptions
   private handleMovementException(train: Train, error: any): void {
      if (error instanceof MovementException) {
         console.log(`Train ${train.number} movement error: ${error.message}`);
         this._eventManager.emit("trainMovementError", train, error);
      } else {
         console.log(`Train ${train.number} stopped due to unknown error: ${error.message}`);
         this._eventManager.emit("trainStopped", train, error);
      }
   }

   // Determine if another train blocks the proposed movement on the same track
   private detectTrainCollision(train: Train): Train | null {
      const currentTrack = train.position?.track;
      if (!currentTrack) return null;

      for (const other of this._trains) {
         if (other === train || other.tailPosition === null) continue;
         if (other.tailPosition.track !== currentTrack) continue; // minimal same-track collision check
         let otherTrainCrashZone = Tools.clamp(
            other.tailPosition.km + other.getLength() * other.direction,
            0,
            currentTrack.length
         );

         if (Tools.between(train.position.km, other.tailPosition.km, otherTrainCrashZone)) return other;
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
         // Set the train's position
         train.setPosition(location.track, location.km);
         train.setDirection(direction);

         // Initialize tail position
         this.updateTailPosition(train);

         console.log(
            `Train ${train.number} positioned on track ${location.track.id} at km ${location.km} with direction ${direction}`
         );
      } else {
         console.error(`Could not find track for exit point ${exitPointId}`);
      }

      this._trains.push(train);
      console.log(`Train added: ${train.getInfo()}`);
      console.log(`Total trains: ${this._trains.length}`);

      // Emit train added event for other components
      this._eventManager.emit("trainAdded", train);
   }

   public spawnLocalTestTrain(): Train | null {
      const track = this._trackLayoutManager.tracks[0];
      if (!track) {
         console.warn("TrainManager: Cannot spawn local test train - no tracks loaded");
         return null;
      }

      const trainNumber = this.generateUniqueTestTrainNumber();
      const train = new Train(trainNumber, 3, 100);

      // Positive direction only (testing requirement)
      const direction = 1;
      const km = Tools.clamp(train.getLength() + 0.1, 0, track.length);
      this.spawnTrainOnTrack(train, track, km, direction);
      return train;
   }

   public spawnTrainOnTrack(train: Train, track: Track, km: number, direction: number): void {
      train.setPosition(track, km);
      train.setDirection(direction);

      const ok = this.updateTailPosition(train);
      if (!ok) {
         console.warn(`TrainManager: Cannot spawn train ${train.number} - tail position hits a switch (derailed)`);
         return;
      }

      this._trains.push(train);
      this._eventManager.emit("trainAdded", train);
   }

   // Remove a train from the manager
   removeTrain(trainNumber: string): boolean {
      this._eventManager.emit("trainRemoved", trainNumber);

      const index = this._trains.findIndex((train) => train.number === trainNumber);
      if (index !== -1) {
         const removedTrain = this._trains.splice(index, 1)[0];
         console.log(`Train removed: ${removedTrain.getInfo()}`);
         console.log(`Total trains: ${this._trains.length}`);
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
      if (!train || !train.position) return false;

      const oldDirection = train.direction;
      train.setDirection(oldDirection * -1);

      const ok = this.updateTailPosition(train);
      if (!ok) {
         // Revert if reversing would make the tail land on a switch (derailed state)
         train.setDirection(oldDirection);
         this.updateTailPosition(train);
         return false;
      }
      return true;
   }

   // Get all trains
   getAllTrains(): Train[] {
      return this._trains;
   }

   // Check if a train exists
   hasTrain(trainNumber: string): boolean {
      return this._trains.some((train) => train.number === trainNumber);
   }

   // Get the number of trains
   getTrainCount(): number {
      return this._trains.length;
   }

   // Clear all trains
   clearAllTrains(): void {
      const count = this._trains.length;
      this._trains = [];

      // Stop simulation if no trains remain
      if (this._isSimulationRunning) {
         this.stopSimulation();
      }

      console.log(`Cleared ${count} trains`);
      this._eventManager.emit("trainsCleared");
   }

   // Get train info for debugging
   getTrainInfo(): string[] {
      return this._trains.map((train) => train.getInfo());
   }

   private generateUniqueTestTrainNumber(): string {
      let i = 1;
      while (true) {
         const candidate = `TEST-${i}`;
         if (!this.hasTrain(candidate)) return candidate;
         i++;
      }
   }

   // Handle train creation events
   private handleTrainCreated(train: Train, exitPointId: number): void {
      console.log(`TrainManager: Received train ${train.getInfo()}`);
      this.spawnTrainAtExitPoint(train, exitPointId);
   }

   // Handle train reached exit events
   private handleTrainReachedExit(train: Train, exit: Exit): void {
      console.log(`TrainManager: Train ${train.number} reached exit ${exit.id}`);
      // Remove the train from local simulation
      this.removeTrain(train.number);
      // Emit event for application to handle server communication
      this._eventManager.emit("sendTrainToServer", train.number, exit.id);
   }

   // Calculate and update the tail position of a train
   // Returns true if the tail position was updated, false if the calculation hits a switch which means the train is derailed
   private updateTailPosition(train: Train): boolean {
      if (!train.position) throw new Error(`Train ${train.number} has no position`);
      const trainLength = train.getLength();
      if (trainLength <= 0) throw new Error(`Train ${train.number} has no length`);

      // Calculate tail position: tail is behind the head when moving forward (direction = 1)
      // and ahead of the head when moving backward (direction = -1)
      const tailOffset = -train.direction * trainLength;

      try {
         const tailResult = this._trackLayoutManager.followRailNetwork(train.position.track, train.position.km, tailOffset);

         // Tail can only be on a Track (switches and exits don't have dimensions)
         if (tailResult.element instanceof Track) {
            train.setTailPosition(tailResult.element, tailResult.km);
            return true;
         } else if (tailResult.element instanceof Switch) {
            return false;
         } else if (tailResult.element instanceof Exit) {
            // If tail calculation hits an exit, keep tail on current track at boundary
            // If going backwards (negative offset), tail is at km 0
            // If going forwards (positive offset), tail is at track.length
            //this happens when the trains is just spawning.
            const boundaryKm = tailOffset < 0 ? 0 : train.position?.track.length;
            train.setTailPosition(train.position?.track, boundaryKm);
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

   // Check if train should stop at a station or depart based on schedule
   // returns true if train should stop at a station or is already stopped, false if it should depart or it is not near the station
   private checkStationStop(train: Train, proposedDistance: number): boolean {
      // Early return if no simulation time or no station stop needed
      if (!this._currentSimulationTime || !train.shouldStopAtCurrentStation || !train.position?.track || !train.position?.track.halt) {
         return false;
      }

      // Check if train is already stopped at this station
      if (train.stopReason === TrainStopReason.STATION) {
         // Train is already stopped - check if it's time to depart
         if (train.departureTime && this._currentSimulationTime >= train.departureTime) {
            // Check if the next signal allows departure
            const nextSignal = this._trackLayoutManager.getNextSignal(train.position.track, train.position.km, train.direction);
            if (nextSignal && !nextSignal.isTrainAllowedToGo()) {
               console.log(`Train ${train.number} cannot depart, Next signal at km ${nextSignal.position} is red`);
               train.setStoppedBySignal(nextSignal);

               train.setStopReason(TrainStopReason.STATION);
               this._eventManager.emit("trainStoppedBySignal", train, nextSignal);
               return true; // Signal is red, cannot depart
            }

            console.log(`Train ${train.number} departing at scheduled time ${train.departureTime.toLocaleTimeString()}`);

            train.setStopReason(TrainStopReason.NONE);
            train.shouldStopAtCurrentStation = false;
            train.setScheduleTimes(null, null); // Clear schedule times
            train.setStationStopStartTime(null);
            train.setWaitingProgress(0);
            this._eventManager.emit("trainDepartedFromStation", train);
            return false;
         }
         // While waiting, update progress relative to departure time
         if (!train.stationStopStartTime) {
            train.setStationStopStartTime(new Date(this._currentSimulationTime!));
         }
         if (train.departureTime && train.stationStopStartTime) {
            const totalMs = train.departureTime.getTime() - train.stationStopStartTime.getTime();
            const elapsedMs = this._currentSimulationTime!.getTime() - train.stationStopStartTime.getTime();
            const progress = totalMs > 0 ? elapsedMs / totalMs : 1;
            train.setWaitingProgress(progress);
         } else {
            train.setWaitingProgress(0);
         }
         return true; // Train is stopped but not time to depart yet
      }

      // Train is not stopped - check if it needs to stop (only calculate distance if needed)

      const trackCenter = train.position?.track.length / 2 + (train.getLength() / 2) * train.direction;
      const distanceFromCenter = Math.abs(train.position.km - trackCenter);
      const isNearStation = distanceFromCenter <= Math.abs(proposedDistance) + 0.1;

      if (isNearStation) {
         // Train is arriving and near the station - stop it
         if (train.arrivalTime && train.departureTime && this._currentSimulationTime > train.arrivalTime) {
            var departureTime = new Date(this._currentSimulationTime.getTime() + SimulationConfig.stationMinStopTime * 1000);
            if (departureTime < train.departureTime) {
               departureTime = train.departureTime;
            }
            train.setScheduleTimes(train.arrivalTime, departureTime);
         }
         console.log(
            `Train ${train.number} stopped at station as scheduled, departure time: ${train.departureTime?.toLocaleTimeString()}`
         );

         train.setStopReason(TrainStopReason.STATION);
         // Mark the start of the station stop if not already set, and reset progress
         if (!train.stationStopStartTime) {
            train.setStationStopStartTime(new Date(this._currentSimulationTime!));
            train.setWaitingProgress(0);
         }
         // Update progress based on current time vs departure
         if (train.departureTime && train.stationStopStartTime) {
            const totalMs = train.departureTime.getTime() - train.stationStopStartTime.getTime();
            const elapsedMs = this._currentSimulationTime!.getTime() - train.stationStopStartTime.getTime();
            const progress = totalMs > 0 ? elapsedMs / totalMs : 1;
            train.setWaitingProgress(progress);
         }
         this._eventManager.emit("trainStoppedAtStation", train);
         return true;
      }

      return false; // Train is not near the station
   }
}
