import Track from "./track";
import Signal from "./signal";
import { SimulationConfig } from "../core/config";

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
    private _track: Track|null;
    private _km: number;
    private _cars: number;
    private _speed: number; // km per simulation step
    private _direction: number; // 1 for forward, -1 for backward
    private _isMoving: boolean;
    private _stoppedBySignal: Signal | null; // Signal that currently stops this train
    private _shouldStopAtCurrentStation: string | null = null; // Station ID where train should stop, or null if no stop needed
    private _arrivalTime: Date | null = null; // Scheduled arrival time at current station
    private _departureTime: Date | null = null; // Scheduled departure time at current station
    private _stopReason: TrainStopReason = TrainStopReason.NONE; // Current reason why the train is stopped

    constructor(number: string, track: Track|null, km: number) {
        this._number = number;
        this._spawnTime = new Date();
        this._track = track;
        this._km = km;
        this._cars = 4;
        this._speed = 150; // Default speed: 50 km/h
        this._direction = 1; // Default direction: forward
        this._isMoving = true; // Default: train is moving
        this._stoppedBySignal = null; // Initially not stopped by any signal
    }

    // Static factory method to create a train from server data
    static fromServerData(data: any): Train {
        const train = new Train(data.trainNumber, null, 0);
        
        // Set schedule times if provided
        if (data.arrivalTime) {
            train.setScheduleTimes(new Date(data.arrivalTime), data.departureTime ? new Date(data.departureTime) : null);
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

    get shouldStopAtCurrentStation(): string | null {
        return this._shouldStopAtCurrentStation;
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

    // Set the station where this train should stop
    setShouldStopAtCurrentStation(stationId: string | null): void {
        this._shouldStopAtCurrentStation = stationId;
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
    // speed is in km/h, timeElapsedSeconds is in seconds
    getMovementDistance(timeElapsedSeconds: number): number {
        if (!this._isMoving) {
            return 0;
        }
        
        // Convert speed from km/h to km/s, then multiply by time and direction
        const speedKmPerSecond = this._speed / 3600; // Convert km/h to km/s
        return speedKmPerSecond * timeElapsedSeconds * this._direction*SimulationConfig.simulationScale;
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