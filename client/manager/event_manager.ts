import { Application } from "../core/application";

type EventCallback = (...args: any[]) => void;

export class CancellableEvent {
    private _defaultPrevented: boolean = false;
    
    preventDefault(): void {
        this._defaultPrevented = true;
    }
    
    get defaultPrevented(): boolean {
        return this._defaultPrevented;
    }
}

export class EventManager {
    private _listeners: Map<string, EventCallback[]> = new Map();

    constructor() {
        
    }

    init() {
    }

    // Emit an event to all listeners
    emit(eventName: string, ...args: any[]): void {
        const listeners = this._listeners.get(eventName);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in event listener for ${eventName}:`, error);
                }
            });
        }
    }

    // Emit a cancellable event to all listeners
    emitCancellable(eventName: string, ...args: any[]): CancellableEvent {
        const event = new CancellableEvent();
        const listeners = this._listeners.get(eventName);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(event, ...args);
                } catch (error) {
                    console.error(`Error in event listener for ${eventName}:`, error);
                }
            });
        }
        return event;
    }

    // Add a listener for an event
    on(eventName: string, callback: EventCallback): void {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        this._listeners.get(eventName)!.push(callback);
    }

    // Add a listener at the beginning of the listener array (runs first)
    prepend(eventName: string, callback: EventCallback): void {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        this._listeners.get(eventName)!.unshift(callback);
    }

    // Remove a specific listener
    off(eventName: string, callback: EventCallback): void {
        const listeners = this._listeners.get(eventName);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    // Remove all listeners for an event
    removeAllListeners(eventName: string): void {
        this._listeners.delete(eventName);
    }

    // Clear all listeners
    clear(): void {
        this._listeners.clear();
    }
}

export default EventManager;