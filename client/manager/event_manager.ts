import { Application } from "../core/application";

type EventCallback = (...args: any[]) => void;

export class EventManager {
    private _listeners: Map<string, EventCallback[]> = new Map();
    private _application: Application;

    constructor(application: Application) {
        this._application = application;
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

    // Add a listener for an event
    on(eventName: string, callback: EventCallback): void {
        if (!this._listeners.has(eventName)) {
            this._listeners.set(eventName, []);
        }
        this._listeners.get(eventName)!.push(callback);
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