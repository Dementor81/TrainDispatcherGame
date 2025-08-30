import Train, { TrainStopReason } from "../sim/train";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import Signal from "../sim/signal";
import { EventManager } from "./event_manager";
import { TrackLayoutManager, MovementException } from "./trackLayout_manager";
import { SimulationConfig } from "../core/config";
import { getSimulationStatus } from "../network/api";

export class TrainManager {
   private _trains: Train[] = [];
   private _eventManager: EventManager;
   private _trackLayoutManager: TrackLayoutManager;
   // Simulation properties
   private _simulationTimer: NodeJS.Timeout | null = null;
   private _timerWorker: Worker | null = null;
   private _isSimulationRunning: boolean = false;
   private _simulationSpeed: number = SimulationConfig.simulationSpeed; // Speed multiplier (1.0 = normal speed)
   private _currentSimulationTime: Date | null = null; // Current simulation time from server
   private _lastSimulationTimeUpdate: number = 0; // When we last updated simulation time

   public get currentSimulationTime(): Date | null {
      return this._currentSimulationTime;
   }

   constructor(eventManager: EventManager, trackLayoutManager: TrackLayoutManager) {
      this._eventManager = eventManager;
      this._trackLayoutManager = trackLayoutManager;

      // Subscribe to train creation events
      this._eventManager.on("trainCreated", (train: Train, exitPointId: string) => {
         this.handleTrainCreated(train, exitPointId);
      });

      // Subscribe to train reached exit events to handle sending back to server
      this._eventManager.on("trainReachedExit", (train: Train, exit: Exit) => {
         this.handleTrainReachedExit(train, exit);
      });

      console.log("TrainManager initialized and subscribed to train events");
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
            this._timerWorker.postMessage({ type: 'stop' });
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
         this._timerWorker = new Worker(new URL('../core/simulationTimer.worker.ts', import.meta.url), { type: 'module' } as any);
         this._timerWorker.onmessage = (evt: MessageEvent<any>) => {
            if (!this._isSimulationRunning) return;
            // Could compute delta time here using evt.data.now if we later switch to dt-based movement
            this.updateSimulation();
         };
         this._timerWorker.postMessage({ type: 'start', intervalMs });
      } catch (err) {
         console.warn('Worker timer unavailable, falling back to setInterval', err);
         this._simulationTimer = setInterval(() => {
            this.updateSimulation();
         }, intervalMs);
      }
   }

   // Check if simulation is running
   isSimulationRunning(): boolean {
      return this._isSimulationRunning;
   }

   // Set simulation speed multiplier
   setSimulationSpeed(speed: number): void {
      this._simulationSpeed = Math.max(0.1, Math.min(5.0, speed)); // Clamp between 0.1x and 5.0x
      console.log(`Simulation speed set to ${this._simulationSpeed}x`);
   }

   // Get current simulation speed
   getSimulationSpeed(): number {
      return this._simulationSpeed;
   }

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
      if (!train.track) {
         console.log(`Train ${train.number} can't move or is stopped`);
         return false; // Train can't move or is stopped
      }

      // Calculate movement distance based on elapsed time

      // Collision check with other trains on the same track
      const proposedDistance = train.getMovementDistance();

      const blockingTrain = this.detectTrainCollision(train, proposedDistance);
      if (blockingTrain) {
         // Do not advance this tick to avoid collision
         this._eventManager.emit("trainCollision", train, blockingTrain);
         return false;
      }

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
            console.log(`Train ${train.number} stopped by signal at km ${stoppingSignal.position} on track ${train.track.id}`);
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
         const result = this._trackLayoutManager.followRailNetwork(train.track, train.km, movedDistance);

         // Check what type of element we got
         if (result.element instanceof Track) {
            // Store previous position before updating
            const previousTrack = train.track;
            const previousKm = train.km;

            // Normal movement - update train position
            train.setPosition(result.element, result.km);
            train.setDirection(result.direction);

            // Check if train passed any signals during this movement
            this.checkSignalsPassed(train, previousTrack, previousKm, result.element, result.km);

            return true; // Train was updated
         } else if (result.element instanceof Exit) {
            // Train reached exit - clear signal reference since this isn't a signal stop
            const exit = result.element;
            console.log(`Train ${train.number} reached exit ${exit.id}`);
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
      if (!train.track) {
         return null;
      }

      // Total distance to look ahead: movement distance + lookahead distance
      const totalLookaheadDistance = SimulationConfig.signalLookaheadDistance;

      try {
         // Use followRailNetwork to trace the path ahead
         const result = this._trackLayoutManager.followRailNetwork(
            train.track,
            train.km,
            totalLookaheadDistance * train.direction
         );

         // Check for signals on the current track first
         const currentTrackSignals = this.checkSignalsOnTrack(
            train.track,
            train.km,
            train.km + totalLookaheadDistance * train.direction,
            train.direction
         );

         if (currentTrackSignals) {
            return currentTrackSignals;
         }

         // If we moved to a different track, check signals on that track too
         if (result.element instanceof Track && result.element !== train.track) {
            const nextTrackSignals = this.checkSignalsOnTrack(
               result.element,
               result.element === train.track ? train.km : train.direction > 0 ? 0 : result.element.length,
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
            this._eventManager.emit("trainPassedSignal", train, signal, track);
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
   private detectTrainCollision(train: Train, proposedDistance: number): Train | null {
      const currentTrack = train.track;
      if (!currentTrack) return null;

      const headCurrent = train.km;
      const headNew = headCurrent + proposedDistance;
      const pathMin = Math.min(headCurrent, headNew);
      const pathMax = Math.max(headCurrent, headNew);

      for (const other of this._trains) {
         if (other === train) continue;
         if (other.track !== currentTrack) continue; // minimal same-track collision check

         // Compute other's body segment on this track
         const otherHead = other.km;
         const otherTail = other.direction > 0 ? otherHead - other.getLength() : otherHead + other.getLength();
         let otherStart = Math.min(otherHead, otherTail);
         let otherEnd = Math.max(otherHead, otherTail);

         // Clamp to track bounds
         otherStart = Math.max(0, otherStart);
         otherEnd = Math.min(currentTrack.length, otherEnd);

         // Expand by safety gap
         const expandedStart = Math.max(0, otherStart - SimulationConfig.safetyGapDistance);
         const expandedEnd = Math.min(currentTrack.length, otherEnd + SimulationConfig.safetyGapDistance);

         // Check intersection between our head path and the other's expanded body segment
         const intersects = !(pathMax < expandedStart || pathMin > expandedEnd);
         if (intersects) {
            return other;
         }
      }

      // If the move crosses into a different track, check that segment too
      try {
         const result = this._trackLayoutManager.followRailNetwork(currentTrack, headCurrent, proposedDistance);
         if (result.element instanceof Track && result.element !== currentTrack) {
            const nextTrack: Track = result.element;
            const segmentStartKm = train.direction > 0 ? 0 : nextTrack.length;
            const segmentEndKm = result.km;
            const segMin = Math.min(segmentStartKm, segmentEndKm);
            const segMax = Math.max(segmentStartKm, segmentEndKm);

            for (const other of this._trains) {
               if (other === train) continue;
               if (other.track !== nextTrack) continue;

               const otherHead = other.km;
               const otherTail = other.direction > 0 ? otherHead - other.getLength() : otherHead + other.getLength();
               let otherStart = Math.min(otherHead, otherTail);
               let otherEnd = Math.max(otherHead, otherTail);

               otherStart = Math.max(0, otherStart);
               otherEnd = Math.min(nextTrack.length, otherEnd);

               const expandedStart = Math.max(0, otherStart - SimulationConfig.safetyGapDistance);
               const expandedEnd = Math.min(nextTrack.length, otherEnd + SimulationConfig.safetyGapDistance);

               const intersects = !(segMax < expandedStart || segMin > expandedEnd);
               if (intersects) {
                  return other;
               }
            }
         }
      } catch {
         // ignore followRailNetwork errors here; collision check best-effort
      }

      return null;
   }

   // ==================== TRAIN MANAGEMENT METHODS ====================

   // Add a new train to the manager at a specific exit point
   spawnTrainAtExitPoint(train: Train, exitPointId: string): void {
      // Get the track and kilometer position for this exit point
      const location = this._trackLayoutManager.getExitPointLocation(exitPointId);
      const direction = this._trackLayoutManager.getExitPointDirection(exitPointId);
      if (location.track) {
         // Set the train's position
         train.setPosition(location.track, location.km);
         train.setDirection(direction);
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

   // Handle train creation events
   private handleTrainCreated(train: Train, exitPointId: string): void {
      console.log(`TrainManager: Received train ${train.getInfo()}`);
      this.spawnTrainAtExitPoint(train, exitPointId);
   }

   // Handle train reached exit events
   private handleTrainReachedExit(train: Train, exit: Exit): void {
      console.log(`TrainManager: Train ${train.number} reached exit ${exit.id}`);

      if (exit.destination) {
         console.log(`TrainManager: Sending train ${train.number} to destination ${exit.destination}`);

         // Remove the train from local simulation
         this.removeTrain(train.number);

         // Emit event for application to handle server communication
         this._eventManager.emit("sendTrainToServer", train.number, exit.id);
      } else {
         console.error(`TrainManager: Exit ${exit.id} has no destination`);
         // Still remove the train even if we can't send it
         this.removeTrain(train.number);
      }
   }

   // Check if train should stop at a station or depart based on schedule
   // returns true if train should stop at a station or is already stopped, false if it should depart or it is not near the station
   private checkStationStop(train: Train, proposedDistance: number): boolean {
      // Early return if no simulation time or no station stop needed
      if (!this._currentSimulationTime || !train.shouldStopAtCurrentStation || !train.track || !train.track.halt) {
         return false;
      }

      // Check if train is already stopped at this station
      if (train.stopReason === TrainStopReason.STATION) {
         // Train is already stopped - check if it's time to depart
         if (train.departureTime && this._currentSimulationTime >= train.departureTime) {
            // Check if the next signal allows departure
            const nextSignal = this._trackLayoutManager.getNextSignal(train.track, train.km, train.direction);
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
            this._eventManager.emit("trainDepartedFromStation", train);
            return false;
         }
         return true; // Train is stopped but not time to depart yet
      }

      // Train is not stopped - check if it needs to stop (only calculate distance if needed)

      const trackCenter = train.track.length / 2 + (train.getLength() / 2) * train.direction;
      const distanceFromCenter = Math.abs(train.km - trackCenter);
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
         this._eventManager.emit("trainStoppedAtStation", train);
         return true;
      }

      return false; // Train is not near the station
   }
}
