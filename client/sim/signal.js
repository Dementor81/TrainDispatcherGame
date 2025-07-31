"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Signal {
    static fromObject(object) {
        const signal = new Signal();
        signal._type = object.type;
        signal._position = object.position;
        signal._state = true; // Default to green/go state
        return signal;
    }
    constructor() {
        this._type = '';
        this._position = 0;
        this._state = true; // Default to green/go state
    }
    get type() {
        return this._type;
    }
    get position() {
        return this._position;
    }
    get state() {
        return this._state;
    }
    set state(value) {
        this._state = value;
    }
    /**
     * Check if a train is allowed to proceed past this signal
     * @returns true if train can go, false if train must stop
     */
    isTrainAllowedToGo() {
        return this._state;
    }
    /**
     * Reset the signal to its default go state (green)
     */
    reset() {
        this._state = true;
    }
    /**
     * Set signal to stop state (red)
     */
    stop() {
        this._state = false;
    }
}
exports.default = Signal;
