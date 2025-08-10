import Track from "./track";
import Signal from "./signal";
import { SimulationConfig, RendererConfig } from "../core/config";

// Enum for reasons why a train might be stopped
export enum TrainStopReason {
    NONE = "none",
    SIGNAL = "signal",
    STATION = "station",
    END_OF_TRACK = "end_of_track"
}

class Train {
    private _number: string;
    private _spawnTime: Date;
    private _track: Track|null = null;
    private _km: number = 0;
    private _cars: number;
    private _speed: number; // km per simulation step
    private _direction: number; // 1 for forward, -1 for backward
    private _isMoving: boolean;
    private _stoppedBySignal: Signal | null; // Signal that currently stops this train
    private _shouldStopAtCurrentStation: boolean = false; // Station ID where train should stop, or null if no stop needed
    private _arrivalTime: Date | null = null; // Scheduled arrival time at current station
    private _departureTime: Date | null = null; // Scheduled departure time at current station
    private _stopReason: TrainStopReason = TrainStopReason.NONE; // Current reason why the train is stopped

    constructor(number: string, cars: number) {
        this._number = number;
        this._spawnTime = new Date();
        this._cars = cars;
        this._speed = 150; 
        this._direction = 1; 
        this._isMoving = true; 
        this._stoppedBySignal = null; // Initially not stopped by any signal
    }

    // Static factory method to create a train from server data
    static fromServerData(data: any): Train {
        const train = new Train(data.trainNumber, data.cars);
        
        // Set schedule times if provided
        if (data.departureTime) {
            train.setScheduleTimes(data.arrivalTime ? new Date(data.arrivalTime) : null, new Date(data.departureTime));
            train.shouldStopAtCurrentStation = data.shouldStopAtStation;
        }
        
        return train;
    }

    // Getters
    get number(): string {
        return this._number;
    }

    get track(): Track | null {
        return this._track;
    }

    get km(): number {
        return this._km;
    }

    get spawnTime(): Date {
        return this._spawnTime;
    }

    get cars(): number {
        return this._cars;
    }

    get speed(): number {
        return this._speed;
    }

    get direction(): number {
        return this._direction;
    }

    get isMoving(): boolean {
        return this._isMoving;
    }

    get stoppedBySignal(): Signal | null {
        return this._stoppedBySignal;
    }

    get shouldStopAtCurrentStation(): boolean {
        return this._shouldStopAtCurrentStation;
    }

    set shouldStopAtCurrentStation(shouldStop: boolean) {
        this._shouldStopAtCurrentStation = shouldStop;
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
        this._track = track;
        this._km = km;
    }

    // Set the train's speed
    setSpeed(speed: number): void {
        this._speed = Math.max(0, speed); // Ensure speed is not negative
    }

    // Set the train's direction
    setDirection(direction: number): void {
        this._direction = direction === 1 ? 1 : -1; // Normalize to 1 or -1
    }

    // Start/stop the train
    setMoving(isMoving: boolean): void {
        this._isMoving = isMoving;
        // Clear stopped signal when train starts moving
        if (isMoving) {
            this._stoppedBySignal = null;
            this._stopReason = TrainStopReason.NONE;
        }
    }

    // Set the signal that is currently stopping this train
    setStoppedBySignal(signal: Signal | null): void {
        this._stoppedBySignal = signal;
        // If stopped by a signal, ensure train is not moving
        if (signal) {
            this._isMoving = false;
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
        // If setting a stop reason, ensure train is not moving
        if (reason !== TrainStopReason.NONE) {
            this._isMoving = false;
        }
    }

    // Update train position based on current speed and direction
    // Returns the distance the train should move based on elapsed time
    // speed is in km/h
    getMovementDistance(): number {

        const timeElapsedSeconds = SimulationConfig.simulationIntervalSeconds * SimulationConfig.simulationSpeed;
        if (!this._isMoving) {
            return 0;
        }
        
        // Convert speed from km/h to m/s, then multiply by time and direction
        const speed_m_per_s = this._speed / 3.6; // Convert km/h to m/s
        return speed_m_per_s * timeElapsedSeconds * this._direction;
    }

    // Method to get train info for debugging/logging
    getInfo(): string {
        let info = `Train ${this._number}`;
        
        if (this._track) {
            info += ` on track ${this._track.id} at km ${this._km}`;
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