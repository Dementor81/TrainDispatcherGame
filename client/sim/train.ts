import Track from "./track";
import Signal from "./signal";
import { SimulationConfig, RendererConfig } from "../core/config";
import RailPosition from "./railPosition";
import { TrainWayPointActionType } from "../network/dto";

// Enum for reasons why a train might be stopped
export enum TrainStopReason {
    NONE = "none",
    SIGNAL = "signal",
    STATION = "station",
    END_OF_TRACK = "end_of_track",
    COLLISION = "collision",
    EMERGENCY_STOP = "emergency_stop",
    DERAILEMENT = "derailement"

}

class Train {
    private _number: string;
    private _position: RailPosition|null = null;
    private _tailPosition: RailPosition|null = null;
    private _cars: number;
    private _speed: number; // m/s
    private _drawingDirection: number; // 1 = locomotive on right, -1 = locomotive on left
    private _movingDirection: number; // 1 = moving forward (increasing km), -1 = moving backward (decreasing km)
    private _stoppedBySignal: Signal | null; // Signal that currently stops this train
    private _action: TrainWayPointActionType = 'PassThrough'; // How the train acts at the current station
    private _arrivalTime: Date | null = null; // Scheduled arrival time at current station
    private _departureTime: Date | null = null; // Scheduled departure time at current station
    private _stopReason: TrainStopReason = TrainStopReason.NONE; // Current reason why the train is stopped
    private _stationStopStartTime: Date | null = null; // When the train actually started waiting at station
    private _waitingProgress: number = 0; // 0..1 progress while waiting at station

    constructor(number: string, cars: number, speed: number) {
        this._number = number;
        this._cars = cars;
        this._speed = speed 
        this._drawingDirection = 1;
        this._movingDirection = 1;
        this._stoppedBySignal = null; 
    }

    // Static factory method to create a train from server data
    static fromServerData(data: any): Train {
        const train = new Train(data.trainNumber, data.cars, data.speed);
        
        // Set schedule times if provided
        if (data.departureTime) {
            train.setScheduleTimes(data.arrivalTime ? new Date(data.arrivalTime) : null, new Date(data.departureTime));
            train.action = data.action || 'PassThrough';
        }
        
        return train;
    }

    // Getters
    get number(): string {
        return this._number;
    }

    get position(): RailPosition | null {
        return this._position;
    }

    get tailPosition(): RailPosition | null {
        return this._tailPosition;
    }

    get cars(): number {
        return this._cars;
    }

    get speed(): number {
        return this._speed;
    }

    get drawingDirection(): number {
        return this._drawingDirection;
    }

    get movingDirection(): number {
        return this._movingDirection;
    }

    // Returns true if the locomotive is at the front (leading the movement)
    get isLocomotiveLeading(): boolean {
        return this._drawingDirection === this._movingDirection;
    }

    // Returns the position of the leading edge of the train (front)
    get leadingPosition(): RailPosition | null {
        return this.isLocomotiveLeading ? this._position : this._tailPosition;
    }

    get stoppedBySignal(): Signal | null {
        return this._stoppedBySignal;
    }

    get action(): TrainWayPointActionType {
        return this._action;
    }

    set action(action: TrainWayPointActionType) {
        this._action = action;
    }

    get shouldStopAtCurrentStation(): boolean {
        return this._action === 'Stop' || this._action === 'End';
    }

    get arrivalTime(): Date | null {
        return this._arrivalTime;
    }

    get departureTime(): Date | null {
        return this._departureTime;
    }

    get stopReason(): TrainStopReason {
        return this._stopReason;
    }

    get stationStopStartTime(): Date | null {
        return this._stationStopStartTime;
    }

    setStationStopStartTime(time: Date | null): void {
        this._stationStopStartTime = time;
    }

    get waitingProgress(): number {
        return this._waitingProgress;
    }

    setWaitingProgress(progress: number): void {
        // Clamp to [0,1]
        const clamped = Math.max(0, Math.min(1, progress));
        this._waitingProgress = clamped;
    }

    setTailPosition(track: Track | null, km: number): void {
        if (track === null) this._tailPosition = null;
        else this._tailPosition = new RailPosition(track, km);
    }

    // Calculate the actual length of the train based on configured car width and spacing
    getLength(): number {
        if (this._cars === 0) {
            return 0;
        }
        
        // First car (locomotive) uses locomotive width
        const locomotiveLength = RendererConfig.locomotiveWidth;
        
        // Remaining cars use car width
        const carLength = RendererConfig.carWidth;
        const remainingCars = this._cars - 1;
        
        // Calculate total length: locomotive + cars + spacing between cars
        const totalLength = locomotiveLength + (remainingCars * carLength) + (remainingCars * RendererConfig.trainCarSpacing);
        
        return totalLength;
    }

    // Set the train's position
    setPosition(track: Track, km: number): void {
       this._position = new RailPosition(track, km);
    }   

    // Set the train's drawing direction (locomotive orientation)
    setDrawingDirection(direction: number): void {
        this._drawingDirection = direction === 1 ? 1 : -1; // Normalize to 1 or -1
    }

    // Set the train's moving direction
    setMovingDirection(direction: number): void {
        this._movingDirection = direction === 1 ? 1 : -1; // Normalize to 1 or -1
    }


    // Set the signal that is currently stopping this train
    setStoppedBySignal(signal: Signal | null): void {
        this._stoppedBySignal = signal;
        // If stopped by a signal, ensure train is not moving
        if (signal) {
            this._stopReason = TrainStopReason.SIGNAL;
        } else {
            // If signal is cleared and no other stop reason, clear stop reason
            if (this._stopReason === TrainStopReason.SIGNAL) {
                this._stopReason = TrainStopReason.NONE;
            }
        }
    }

    

    // Set the scheduled arrival and departure times for the current station
    setScheduleTimes(arrivalTime: Date | null, departureTime: Date | null): void {
        this._arrivalTime = arrivalTime;
        this._departureTime = departureTime;
    }

    // Set the stop reason
    setStopReason(reason: TrainStopReason): void {
        this._stopReason = reason;
    }

    // Update train position based on current speed and moving direction
    // Returns the distance in meters the train should move based on elapsed time
    // speed is in m/s
    getMovementDistance(): number {

        const timeElapsedSeconds = SimulationConfig.simulationIntervalSeconds * SimulationConfig.simulationSpeed;
        return this._speed * timeElapsedSeconds * this._movingDirection;
    }

    // Method to get train info for debugging/logging
    getInfo(): string {
        let info = `Train ${this._number}`;
        
        if (this._position) {
            info += ` on track ${this._position.track.id} at km ${this._position.km}`;
        } else {
            info += ` (not positioned)`;
        }
        
        if (this._arrivalTime) {
            info += `, arrival: ${this._arrivalTime.toLocaleTimeString()}`;
        }
        
        if (this._departureTime) {
            info += `, departure: ${this._departureTime.toLocaleTimeString()}`;
        }

        if (this._stopReason !== TrainStopReason.NONE) {
            info += `, stopped: ${this._stopReason}`;
        }
        
        return info;
    }
}

export default Train;