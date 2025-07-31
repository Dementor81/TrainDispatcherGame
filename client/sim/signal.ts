class Signal {
    static fromObject(object: any): Signal {
        const signal = new Signal();
        signal._type = object.type;
        signal._position = object.position;
        signal._direction = object.direction || 1; // Default to forward direction
        return signal;
    }

    private _type: string;
    private _position: number; // km position along the track
    private _state: boolean; // true = go (green), false = stop (red)
    private _direction: number; // 1 = forward (positive track direction), -1 = backward (negative track direction)

    constructor() {
        this._type = '';
        this._position = 0;
        this._state = false; // Default to red/stop state
        this._direction = 1; // Default to forward direction
    }

    get type(): string {
        return this._type;
    }

    get position(): number {
        return this._position;
    }

    get direction(): number {
        return this._direction;
    }

    get state(): boolean {
        return this._state;
    }

    set state(value: boolean) {
        this._state = value;
    }

    /**
     * Check if a train is allowed to proceed past this signal
     * @returns true if train can go, false if train must stop
     */
    isTrainAllowedToGo(): boolean {
        return this._state;
    }

    /**
     * Reset the signal to its default go state (green)
     */
    reset(): void {
        this._state = true;
    }

    /**
     * Set signal to stop state (red)
     */
    stop(): void {
        this._state = false;
    }
}

export default Signal;