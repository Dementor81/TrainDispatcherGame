import Train from '../sim/train';
import { EventManager } from './event_manager';
import { TrackLayoutManager } from './trackLayout_manager';

export class TrainManager {
    private _trains: Train[] = [];
    private _eventManager: EventManager;
    private _trackLayoutManager: TrackLayoutManager;

    constructor(eventManager: EventManager, trackLayoutManager: TrackLayoutManager) {
        this._eventManager = eventManager;
        this._trackLayoutManager = trackLayoutManager;
        
        // Subscribe to train creation events
        this._eventManager.on('trainCreated', (train: Train, exitPointId: string) => {
            this.handleTrainCreated(train, exitPointId);
        });
        
        console.log('TrainManager initialized and subscribed to train events');
    }

    // Add a new train to the manager at a specific exit point
    addTrainAtExitPoint(train: Train, exitPointId: string): void {
        // Get the track and kilometer position for this exit point
        const location = this._trackLayoutManager.getExitPointLocation(exitPointId);
        
        if (location.track) {
            // Set the train's position
            train.setPosition(location.track, location.km);
            console.log(`Train ${train.number} positioned on track ${location.track.id} at km ${location.km}`);
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
        console.log(`Cleared ${count} trains`);
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