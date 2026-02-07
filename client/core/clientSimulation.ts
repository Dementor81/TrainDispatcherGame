import { EventManager } from "../manager/event_manager";
import { SimulationConfig } from "./config";
import { getSimulationStatus } from "../network/api";
import { SimulationState } from "../network/dto";

/**
 * ClientSimulation handles the simulation timer and time tracking
 * for the client-side simulation.
 */
export class ClientSimulation {
   private _eventManager: EventManager;
   
   // Timer properties
   private _simulationTimer: NodeJS.Timeout | null = null;
   private _timerWorker: Worker | null = null;
   private _isSimulationRunning: boolean = false;
   
   // Simulation time tracking
   private _currentSimulationTime: Date | null = null;
   private _lastSimulationTimeUpdate: number = 0;
   
   // Simulation state tracking
   private _simulationState: SimulationState = 'Stopped';
   
   // Callback to invoke on each simulation tick
   private _onTick: (() => void) | null = null;

   public get currentSimulationTime(): Date | null {
      return this._currentSimulationTime;
   }

   public get isRunning(): boolean {
      return this._isSimulationRunning;
   }
   
   public get simulationState(): SimulationState {
      return this._simulationState;
   }

   constructor(eventManager: EventManager) {
      this._eventManager = eventManager;
      
      // Subscribe to simulation state changes from server
      this._eventManager.on('simulationStateChanged', (state: SimulationState) => {
         this.handleSimulationStateChanged(state);
      });
      
      // Initialize with server state on startup
      this.initialize();
   }
   
   /**
    * Initialize the simulation by fetching current server state and synchronizing
    */
   private async initialize(): Promise<void> {
      try {
         const status = await getSimulationStatus();
         
         // Synchronize simulation time
         this._currentSimulationTime = new Date(status.currentTime);
         this._lastSimulationTimeUpdate = Date.now();
         
         // Synchronize simulation state
         if (status.state) {
            this.handleSimulationStateChanged(status.state as SimulationState);
            // Emit the initial state so other components can react
            this._eventManager.emit('simulationStateChanged', status.state);
         }
         
         // Synchronize simulation speed
         if (typeof status.speed === 'number') {
            SimulationConfig.simulationSpeed = Math.max(0.1, Math.min(100, status.speed));
            this._eventManager.emit('simulationSpeedChanged', status.speed);
         }
         
         console.log(`ClientSimulation: Initialized with server state: ${status.state}, time: ${status.currentTime}, speed: ${status.speed}`);
      } catch (error) {
         console.error('ClientSimulation: Failed to initialize from server:', error);
      }
   }
   

   
   /**
    * Handle simulation state changes from the server
    */
   private handleSimulationStateChanged(state: SimulationState): void {
      // Store the state
      this._simulationState = state;
      
      switch (state.toLowerCase()) {
         case 'running':
            this.resumeSimulation();
            console.log('ClientSimulation: Resumed');
            break;
         case 'paused':
            this.pauseSimulation();
            console.log('ClientSimulation: Paused');
            break;
         case 'stopped':
            this.stopSimulation();
            // Invoke stop callback if set (e.g., to clear trains)            
            console.log('ClientSimulation: Stopped');
            break;
         default:
            console.log(`ClientSimulation: Unknown simulation state: ${state}`);
      }
   }

   /**
    * Set the callback function to be invoked on each simulation tick
    */
   public setTickCallback(callback: () => void): void {
      this._onTick = callback;
   }

   /**
    * Start the simulation from a stopped state
    */
   public startSimulation(): void {
      if (this._isSimulationRunning) {
         console.log("Simulation is already running");
         return;
      }

      this.resumeSimulation();
      console.log("Client simulation started");
      this._eventManager.emit("simulationStarted");
   }

   /**
    * Stop the simulation completely
    */
   public stopSimulation(): void {
      if (!this._isSimulationRunning) {
         console.log("Simulation is not running");
         return;
      }

      this.pauseSimulation();
      console.log("Client simulation stopped");
      this._eventManager.emit("simulationStopped");
   }

   /**
    * Pause the simulation (can be resumed later)
    */
   public pauseSimulation(): void {
      this._isSimulationRunning = false;
      
      if (this._simulationTimer) {
         clearInterval(this._simulationTimer);
         this._simulationTimer = null;
      }
      
      if (this._timerWorker) {
         try {
            this._timerWorker.postMessage({ type: "stop" });
            this._timerWorker.terminate();
         } catch {}
         this._timerWorker = null;
      }
   }

   /**
    * Resume the simulation from a paused state
    */
   public resumeSimulation(): void {
      if (this._isSimulationRunning) {
         console.log("Simulation is already running");
         return;
      }
      
      this._isSimulationRunning = true;

      const intervalMs = SimulationConfig.simulationIntervalSeconds * 1000;
      
      // Prefer Web Worker-based timer; fall back to setInterval if creation fails
      try {
         // new URL with import.meta.url lets Webpack bundle the worker
         this._timerWorker = new Worker(
            new URL("./simulationTimer.worker.ts", import.meta.url), 
            { type: "module" } as any
         );
         
         this._timerWorker.onmessage = (evt: MessageEvent<any>) => {
            if (!this._isSimulationRunning) return;
            this.tick();
         };
         
         this._timerWorker.postMessage({ type: "start", intervalMs });
      } catch (err) {
         console.warn("Worker timer unavailable, falling back to setInterval", err);
         this._simulationTimer = setInterval(() => {
            this.tick();
         }, intervalMs);
      }
   }

   /**
    * Get current simulation time from server (with caching)
    */
   public async getCurrentSimulationTime(): Promise<Date> {
      const now = Date.now();

      // Cache simulation time for 1 second to avoid too many API calls
      if (!this._currentSimulationTime || now - this._lastSimulationTimeUpdate > 1000) {
         try {
            const status = await getSimulationStatus();
            this._currentSimulationTime = new Date(status.currentTime);
            this._lastSimulationTimeUpdate = now;
         } catch (error) {
            console.warn("Failed to get simulation time from server, using real time:", error);
            this._currentSimulationTime = new Date();
         }
      }

      return this._currentSimulationTime;
   }

   /**
    * Main simulation tick - updates time and invokes the tick callback
    */
   private tick(): void {
      // Update simulation time asynchronously
      this.getCurrentSimulationTime().catch((error) => {
         console.warn("Failed to update simulation time:", error);
      });

      // Invoke the tick callback if set
      if (this._onTick) {
         this._onTick();
      }
   }
}

export default ClientSimulation;
