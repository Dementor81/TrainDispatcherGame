import Train from '../sim/train';
import Track from '../sim/track';
import Switch from '../sim/switch';
import Exit from '../sim/exit';
import Signal from '../sim/signal';
import { EventManager } from './event_manager';
import { TrackLayoutManager, MovementException } from './trackLayout_manager';
import { SimulationConfig } from '../core/config';

export class TrainManager {
    private _trains: Train[] = [];
    private _eventManager: EventManager;
    private _trackLayoutManager: TrackLayoutManager;
    
    // Simulation properties
    private _simulationTimer: NodeJS.Timeout | null = null;
    private _isSimulationRunning: boolean = false;
    private _simulationIntervalMs: number = SimulationConfig.simulationIntervalMs; // Update every 100ms
    private _simulationSpeed: number = SimulationConfig.simulationSpeed; // Speed multiplier (1.0 = normal speed)
    private _lastUpdateTime: number = 0; // Timestamp of last update

    constructor(eventManager: EventManager, trackLayoutManager: TrackLayoutManager) {
        this._eventManager = eventManager;
        this._trackLayoutManager = trackLayoutManager;
        
        // Subscribe to train creation events
        this._eventManager.on('trainCreated', (train: Train, exitPointId: string) => {
            this.handleTrainCreated(train, exitPointId);
        });
        
        console.log('TrainManager initialized and subscribed to train events');
    }

    // ==================== SIMULATION METHODS ====================

    // Start the simulation
    startSimulation(): void {
        if (this._isSimulationRunning) {
            console.log('Simulation is already running');
            return;
        }

        this._isSimulationRunning = true;
        this._lastUpdateTime = Date.now(); // Initialize the time tracking
        this._simulationTimer = setInterval(() => {
            this.updateSimulation();
        }, this._simulationIntervalMs);

        console.log('Train simulation started');
        this._eventManager.emit('simulationStarted');
    }

    // Stop the simulation
    stopSimulation(): void {
        if (!this._isSimulationRunning) {
            console.log('Simulation is not running');
            return;
        }

        this._isSimulationRunning = false;
        if (this._simulationTimer) {
            clearInterval(this._simulationTimer);
            this._simulationTimer = null;
        }

        console.log('Train simulation stopped');
        this._eventManager.emit('simulationStopped');
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

    // Main simulation update loop
    private updateSimulation(): void {
        if (this._trains.length === 0) {
            return; // No trains to update
        }

        // Calculate time elapsed since last update
        const currentTime = Date.now();
        const timeElapsedMs = currentTime - this._lastUpdateTime;
        const timeElapsedSeconds = (timeElapsedMs / 1000) * this._simulationSpeed; // Apply speed multiplier to time
        this._lastUpdateTime = currentTime;

        let trainsUpdated = false;

        // Update each train
        for (const train of this._trains) {
            if (this.updateTrain(train, timeElapsedSeconds)) {
                trainsUpdated = true;
            }
        }

        // Trigger render update if any trains were updated
        if (trainsUpdated) {
            this._eventManager.emit('trainsUpdated', this._trains);
        }
    }

    // Update a single train's position
    private updateTrain(train: Train, timeElapsedSeconds: number): boolean {
        if (!train.track || !train.isMoving) {
            return false; // Train can't move or is stopped
        }

        // Calculate movement distance based on elapsed time
        const signedDistance = train.getMovementDistance(timeElapsedSeconds);

        if (Math.abs(signedDistance) < 0.001) {
            return false; // Movement too small to process
        }

        // Check for signals ahead before moving
        const stoppingSignal = this.checkSignalsAhead(train, Math.abs(signedDistance));
        if (stoppingSignal) {
            // Signal is red - stop the train and store the signal reference
            train.setStoppedBySignal(stoppingSignal);
            console.log(`Train ${train.number} stopped by signal at km ${stoppingSignal.position} on track ${train.track.id}`);
            this._eventManager.emit('trainStoppedBySignal', train, stoppingSignal);
            return false;
        }

        // Use TrackLayoutManager to calculate new position
        try {
            const result = this._trackLayoutManager.followRailNetwork(
                train.track,
                train.km,
                signedDistance
            );

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
                train.setStoppedBySignal(null);
                train.setMoving(false);
                console.log(`Train ${train.number} reached exit ${result.element.id}`);
                this._eventManager.emit('trainReachedExit', train, result.element.id);
                return false;
            } else if (result.element instanceof Switch) {
                // Train stopped at switch (wrong direction/position) - clear signal reference
                train.setStoppedBySignal(null);
                train.setMoving(false);
                console.log(`Train ${train.number} stopped at switch ${result.element.id}`);
                this._eventManager.emit('trainStoppedAtSwitch', train, result.element);
                return false;
            } else {
                // Unknown element type - clear signal reference
                train.setStoppedBySignal(null);
                train.setMoving(false);
                console.log(`Train ${train.number} encountered unknown element`);
                this._eventManager.emit('trainStopped', train, result);
                return false;
            }
        } catch (error) {
            // Movement blocked by actual error (invalid track, zero distance, etc.)
            train.setStoppedBySignal(null); // Clear signal reference for error stops
            train.setMoving(false);
            this.handleMovementException(train, error);
            return false;
        }
    }

    // Check for signals ahead of the train that would stop it
    private checkSignalsAhead(train: Train, movementDistance: number): Signal | null {
        if (!train.track) {
            return null;
        }

        // Total distance to look ahead: movement distance + lookahead distance
        const totalLookaheadDistance = movementDistance + SimulationConfig.signalLookaheadDistance;
        
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
                train.km + (totalLookaheadDistance * train.direction),
                train.direction
            );
            
            if (currentTrackSignals) {
                return currentTrackSignals;
            }

            // If we moved to a different track, check signals on that track too
            if (result.element instanceof Track && result.element !== train.track) {
                const nextTrackSignals = this.checkSignalsOnTrack(
                    result.element,
                    result.element === train.track ? train.km : (train.direction > 0 ? 0 : result.element.length),
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
    private checkSignalsPassed(train: Train, previousTrack: Track | null, previousKm: number, newTrack: Track, newKm: number): void {
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
                this._eventManager.emit('trainPassedSignal', train, signal, track);
            }
        }
    }

    // Handle movement exceptions
    private handleMovementException(train: Train, error: any): void {
        if (error instanceof MovementException) {
            console.log(`Train ${train.number} movement error: ${error.message}`);
            this._eventManager.emit('trainMovementError', train, error);
        } else {
            console.log(`Train ${train.number} stopped due to unknown error: ${error.message}`);
            this._eventManager.emit('trainStopped', train, error);
        }
    }

    // ==================== TRAIN MANAGEMENT METHODS ====================

    // Add a new train to the manager at a specific exit point
    addTrainAtExitPoint(train: Train, exitPointId: string): void {
        // Get the track and kilometer position for this exit point
        const location = this._trackLayoutManager.getExitPointLocation(exitPointId);
        const direction = this._trackLayoutManager.getExitPointDirection(exitPointId);
        if (location.track) {
            // Set the train's position
            train.setPosition(location.track, location.km);
            train.setDirection(direction);
            console.log(`Train ${train.number} positioned on track ${location.track.id} at km ${location.km} with direction ${direction}`);
        } else {
            console.error(`Could not find track for exit point ${exitPointId}`);
        }

        this._trains.push(train);
        console.log(`Train added: ${train.getInfo()}`);
        console.log(`Total trains: ${this._trains.length}`);
        
        // Emit train added event for other components
        this._eventManager.emit('trainAdded', train);
    }

    // Remove a train from the manager
    removeTrain(trainNumber: string): boolean {
        const index = this._trains.findIndex(train => train.number === trainNumber);
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
        return this._trains.find(train => train.number === trainNumber);
    }

    // Get all trains
    getAllTrains(): Train[] {
        return this._trains;
    }

    

    // Check if a train exists
    hasTrain(trainNumber: string): boolean {
        return this._trains.some(train => train.number === trainNumber);
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
        this._eventManager.emit('trainsCleared');
    }

    // Resume trains that were stopped by signals (check if signals are now clear)
    resumeTrainsStoppedBySignals(): void {
        for (const train of this._trains) {
            // Only check trains that are stopped by a specific signal
            if (!train.isMoving && train.stoppedBySignal) {
                // Check if the specific signal that stopped the train is now clear
                if (train.stoppedBySignal.isTrainAllowedToGo()) {
                    // Signal is now green - resume movement
                    train.setMoving(true); // This automatically clears the stoppedBySignal
                    console.log(`Train ${train.number} resumed movement`);
                    this._eventManager.emit('trainResumed', train);
                }
            }
        }
    }

    // Get train info for debugging
    getTrainInfo(): string[] {
        return this._trains.map(train => train.getInfo());
    }

    // Handle train creation events
    private handleTrainCreated(train: Train, exitPointId: string): void {
        console.log(`TrainManager: Received train ${train.getInfo()}`);
        this.addTrainAtExitPoint(train, exitPointId);

    }
} 