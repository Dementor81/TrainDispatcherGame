import Track from "./track";
import Signal from "./signal";
import { SimulationConfig, RendererConfig } from "../core/config";
import RailPosition from "./railPosition";
import { TrainType, TrainWayPointActionType } from "../network/dto";
import { EventManager } from "../manager/event_manager";
import Tools from "../core/utils";

// Explicit finite state machine state for a train
export enum TrainState {
    RUNNING = "running",
    EMERGENCY_BRAKING = "emergency_braking",
    BRAKING_FOR_SIGNAL = "braking_for_signal",
    WAITING_AT_SIGNAL = "waiting_at_signal",
    BRAKING_FOR_STATION = "braking_for_station",
    WAITING_AT_STATION = "waiting_at_station",
    END_OF_TRACK = "end_of_track",
    COLLISION = "collision",
    EMERGENCY_STOP = "emergency_stop",
    DERAILEMENT = "derailement",
    ENDED = "ended",
    MANUAL_CONTROL = "manual_control",
    MISROUTED = "misrouted",
    EXITING = "exiting"
}

type TrainExitState = {
    id: number;
    boundaryKm: number;
    progressMeters: number;
};

const MANUAL_MODE_SPEED_LIMIT_MPS = 20 / 3.6;

export class Train {
    private _eventManager: EventManager;
    private _number: string;
    private _type: TrainType;
    private _category: string | null;
    private _position: RailPosition | null = null;
    private _tailPosition: RailPosition | null = null;
    private _cars: number;
    private _speedMax: number; // m/s
    private _speedCurrent: number; // m/s, current speed on client
    private _speedAimed: number; // m/s, target speed on client
    private _drawingDirection: number; // 1 = locomotive on right, -1 = locomotive on left
    private _movingDirection: number; // 1 = moving forward (increasing km), -1 = moving backward (decreasing km)
    private _stoppedBySignal: Signal | null = null; // Signal that currently stops this train
    private _action: TrainWayPointActionType = 'PassThrough'; // How the train acts at the current station
    private _arrivalTime: Date | null = null; // Scheduled arrival time at current station
    private _departureTime: Date | null = null; // Scheduled departure time at current station
    private _state: TrainState = TrainState.RUNNING;
    private _distanceToStop: number | null = null; // Remaining distance in meters to planned stop target
    private _stationStopStartTime: Date | null = null; // When the train actually started waiting at station
    private _waitingProgress: number = 0; // 0..1 progress while waiting at station
    private _followingTrainNumber: string | null = null; // following train number that will use this vehicle, after this train has completed its journey
    private _exitState: TrainExitState | null = null;

    constructor(
        eventManager: EventManager,
        number: string,
        cars: number,
        speedMax: number,
        type: TrainType = 'Passenger',
        category: string | null = "",

    ) {
        this._eventManager = eventManager;
        this._number = number;
        this._type = type;
        this._category = category;
        this._cars = cars;
        this._speedMax = speedMax;
        this._speedCurrent = speedMax;
        this._speedAimed = speedMax;
        this._drawingDirection = 1;
        this._movingDirection = 1;
    }

    // Static factory method to create a train from server data
    static fromServerData(data: any, eventManager: EventManager): Train {
        const category = data.category ?? data.catagory ?? null;
        const train = new Train(eventManager, data.trainNumber, data.cars, data.speed, data.trainType || 'Passenger', category);

        // Set schedule times if provided
        if (data.departureTime) {
            train.setScheduleTimes(data.arrivalTime ? new Date(data.arrivalTime) : null, new Date(data.departureTime));
            train.action = data.action || 'PassThrough';
        }
        train._followingTrainNumber = data.followingTrainNumber ?? null;
        return train;
    }

    // Getters
    get number(): string {
        return this._number;
    }

    set number(value: string) {
        this._number = value;
    }

    get type(): TrainType {
        return this._type;
    }

    get category(): string | null {
        return this._category;
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

    get speedMax(): number {
        return this._speedMax;
    }

    get maxAllowedSpeed(): number {
        return this._state === TrainState.MANUAL_CONTROL ? Math.min(this._speedMax, MANUAL_MODE_SPEED_LIMIT_MPS) : this._speedMax;
    }

    get speedCurrent(): number {
        return this._speedCurrent;
    }

    set speedCurrent(value: number) {
        this._speedCurrent = Math.max(0, value);
    }

    get speedAimed(): number {
        return this._speedAimed;
    }

    set speedAimed(value: number) {
        this._speedAimed = Math.max(0, value);
    }

    get drawingDirection(): number {
        return this._drawingDirection;
    }

    get movingDirection(): number {
        return this._movingDirection;
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

    get state(): TrainState {
        return this._state;
    }

    get distanceToStop(): number | null {
        return this._distanceToStop;
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

    get followingTrainNumber(): string | null {
        return this._followingTrainNumber;
    }

    get isExiting(): boolean {
        return this._exitState !== null;
    }

    get exitId(): number | null {
        return this._exitState?.id ?? null;
    }

    get exitProgressMeters(): number {
        return this._exitState?.progressMeters ?? 0;
    }

    get exitBoundaryKm(): number | null {
        return this._exitState?.boundaryKm ?? null;
    }



    get length(): number {
        return this._cars * RendererConfig.carWidth + ((this._cars - 1) * RendererConfig.trainCarSpacing);
    }

    startExiting(exitId: number, boundaryKm: number): void {
        this._exitState = { id: exitId, boundaryKm, progressMeters: 0 };
        this.setState(TrainState.EXITING);
    }

    advanceExitProgress(deltaMeters: number): void {
        if (!this._exitState) return;
        this._exitState.progressMeters = Math.max(0, this._exitState.progressMeters + Math.abs(deltaMeters));
    }

    setTailPosition(track: Track | null, km: number): void {
        if (track === null) this._tailPosition = null;
        else this._tailPosition = new RailPosition(track, km);
    }

    reverse(): void {
        const tempTrack = this.position!.track;
        const tempKm = this.position!.km;
        this.setPosition(this.tailPosition!.track, this.tailPosition!.km);
        this.setTailPosition(tempTrack, tempKm);
        this.setMovingDirection(this.movingDirection * -1);
    }

    // Calculate the actual length of the train based on configured car width and spacing
    getLength(): number {
        if (this._cars === 0) {
            return 0;
        }

        // All cars (including locomotive) use the same width
        const totalLength = (this._cars * RendererConfig.carWidth) + ((this._cars - 1) * RendererConfig.trainCarSpacing);

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
    setStoppedBySignal(signal: Signal | null, distanceToStop: number | null = null): void {
        this._stoppedBySignal = signal;
        if (signal) {
            this.setState(TrainState.BRAKING_FOR_SIGNAL, distanceToStop);
        } else {
            if (this._state != TrainState.MANUAL_CONTROL) this.setState(TrainState.RUNNING);
        }
    }



    // Set the scheduled arrival and departure times for the current station
    setScheduleTimes(arrivalTime: Date | null, departureTime: Date | null): void {
        this._arrivalTime = arrivalTime;
        this._departureTime = departureTime;
    }

    isStationState(): boolean {
        return this._state === TrainState.BRAKING_FOR_STATION
            || this._state === TrainState.WAITING_AT_STATION;
    }

    private canTransitionTo(nextState: TrainState): boolean {
        if (this._state === nextState) return true;

        if (this._state === TrainState.COLLISION || this._state === TrainState.DERAILEMENT || this._state === TrainState.ENDED) {
            return false;
        }

        return true;
    }

    static isHardStoppedState(state: TrainState): boolean {
        return Tools.is(state, [TrainState.COLLISION, TrainState.DERAILEMENT, TrainState.END_OF_TRACK, TrainState.ENDED, TrainState.MISROUTED, TrainState.EMERGENCY_STOP]);
    }

    setState(nextState: TrainState, distanceToStop: number | null = null): void {
        if (!this.canTransitionTo(nextState)) return;
        const previousState = this._state;

        this._state = nextState;
        this._distanceToStop = nextState === TrainState.RUNNING || distanceToStop === null
            ? null
            : Math.max(0, distanceToStop);
        this._speedAimed = nextState === TrainState.RUNNING ? this.maxAllowedSpeed : 0;
        if (Train.isHardStoppedState(nextState)) this._speedCurrent = 0;

        if (previousState !== nextState) {
            this._eventManager.emit("trainStateChanged", this, previousState, nextState);
        }
    }

    consumeDistanceToStop(distance: number): void {
        if (this._distanceToStop === null) return;
        this._distanceToStop = Math.max(0, this._distanceToStop - Math.max(0, distance));
    }

    startManualControl(): void {
        if (this.speedCurrent > 0.1) return;
        this.setState(TrainState.MANUAL_CONTROL);
    }

    endManualControl(): void {
        if (this.state !== TrainState.MANUAL_CONTROL) return;
        this.setState(TrainState.RUNNING);
    }

    goManualControl(direction: 1 | -1): void {
        if (this.state !== TrainState.MANUAL_CONTROL) return;

        if (this.movingDirection !== direction) this.reverse();

        this.setStoppedBySignal(null);
        this.speedAimed = this.maxAllowedSpeed;
    }

    // Update train position based on current speed and moving direction
    // Returns the distance in meters the train should move based on elapsed time
    // speed is in m/s
    getMovementDistance(): number {

        const timeElapsedSeconds = SimulationConfig.simulationIntervalSeconds * SimulationConfig.simulationSpeed;
        const currentSpeed = Math.max(0, Math.min(this._speedCurrent, this.maxAllowedSpeed));
        return currentSpeed * timeElapsedSeconds * this._movingDirection;
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

        if (this._state !== TrainState.RUNNING) {
            info += `, state: ${this._state}`;
        }

        return info;
    }
}

export default Train;