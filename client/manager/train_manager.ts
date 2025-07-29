import Train from '../sim/train';
import { EventManager } from './event_manager';
import { TrackLayoutManager } from './trackLayout_manager';

export class TrainManager {
    private _trains: Train[] = [];
    private _eventManager: EventManager;
    private _trackLayoutManager: TrackLayoutManager;
    
    // Simulation properties
    private _simulationTimer: NodeJS.Timeout | null = null;
    private _isSimulationRunning: boolean = false;
    private _simulationIntervalMs: number = 100; // Update every 100ms
    private _simulationSpeed: number = 1.0; // Speed multiplier (1.0 = normal speed)

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

        let trainsUpdated = false;

        // Update each train
        for (const train of this._trains) {
            if (this.updateTrain(train)) {
                trainsUpdated = true;
            }
        }

        // Trigger render update if any trains were updated
        if (trainsUpdated) {
            this._eventManager.emit('trainsUpdated', this._trains);
        }
    }

    // Update a single train's position
    private updateTrain(train: Train): boolean {
        if (!train.track || !train.isMoving) {
            return false; // Train can't move or is stopped
        }

        // Calculate movement distance for this simulation step
        const baseDistance = train.getMovementDistance();
        const actualDistance = baseDistance * this._simulationSpeed;

        if (Math.abs(actualDistance) < 0.001) {
            return false; // Movement too small to process
        }

        // Use TrackLayoutManager to calculate new position
        const result = this._trackLayoutManager.calculateMovement(
            train.track,
            train.km,
            train.direction,
            Math.abs(actualDistance)
        );

        if (result) {
            // Update train position
            train.setPosition(result.track, result.km);
            train.setDirection(result.direction);
            return true; // Train was updated
        } else {
            // Movement blocked (hit exit or dead end) - stop the train
            train.setMoving(false);
            console.log(`Train ${train.number} stopped at exit or dead end`);
            return false;
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