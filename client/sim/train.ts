import Track from "./track";
import Signal from "./signal";
import { SimulationConfig } from "../core/config";

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

    constructor(number: string, track: Track|null, km: number) {
        this._number = number;
        this._spawnTime = new Date();
        this._track = track;
        this._km = km;
        this._cars = 4;
        this._speed = 50; // Default speed: 50 km/h
        this._direction = 1; // Default direction: forward
        this._isMoving = true; // Default: train is moving
        this._stoppedBySignal = null; // Initially not stopped by any signal
    }

    // Static factory method to create a train from server data
    static fromServerData(data: any): Train {
        return new Train(data.trainNumber, null, 0);
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
        }
    }

    // Set the signal that is currently stopping this train
    setStoppedBySignal(signal: Signal | null): void {
        this._stoppedBySignal = signal;
        // If stopped by a signal, ensure train is not moving
        if (signal) {
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
        if (this._track) {
            return `Train ${this._number} on track ${this._track.id} at km ${this._km}`;
        } else {
            return `Train ${this._number} (not positioned)`;
        }
    }
}

export default Train;