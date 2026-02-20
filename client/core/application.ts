import { UIManager } from "../manager/ui_manager";
import { EventManager } from "../manager/event_manager";
import { TrackLayoutManager } from "../manager/trackLayout_manager";
import { TrainManager } from "../manager/train_manager";
import { Renderer } from "../canvas/renderer";
import Switch from "../sim/switch";
import Track from "../sim/track";
import SignalRManager from "../network/signalr";
import Train from "../sim/train";
import { getSimulationStatus } from "../network/api";
import { SimulationState } from "../network/dto";
import ApprovalToast from "../ui/approvalToast";
import { SimulationConfig } from "../core/config";
import TrainRouteManager from "../manager/trainRoute_manager";
import Signal from "../sim/signal";
import { CancellableEvent } from "../manager/event_manager";
import Toast from "../ui/toast";
import { ClientSimulation } from "../core/clientSimulation";
import TrainRoute from "../sim/trainRoute";
import Exit from "../sim/exit";
import SoundsManager from "../manager/sounds_manager";

export class Application {
   private _uiManager: UIManager;
   private _eventManager: EventManager;
   private _trackLayoutManager: TrackLayoutManager;
   private _clientSimulation: ClientSimulation;
   private _trainManager: TrainManager;
   private _trainRouteManager: TrainRouteManager;
   private _renderer: Renderer | null = null;
   private _currentPlayerId: string | null = null;
   private _currentStationId: string | null = null;
   private _signalRManager: SignalRManager;
   private _soundsManager: SoundsManager;
   private _signalBlockedExits: Map<Signal, number> = new Map();

   constructor() {
      this._eventManager = new EventManager();
      this._signalRManager = new SignalRManager(this._eventManager);
      this._soundsManager = new SoundsManager(this._eventManager);
      this._uiManager = new UIManager(this, this._eventManager);
      this._trackLayoutManager = new TrackLayoutManager(this);
      this._clientSimulation = new ClientSimulation(this._eventManager);
      this._trainManager = new TrainManager(
         this._eventManager, 
         this._trackLayoutManager, 
         this._signalRManager,
         this._clientSimulation
      );
      this._trainRouteManager = new TrainRouteManager(this._trackLayoutManager, this._eventManager);

      // Set up the simulation tick callback
      this._clientSimulation.setTickCallback(() => {
         this._trainManager.updateSimulation();
      });  
   }

   async init() {
      this._uiManager.init();
      this._eventManager.init();
      this._soundsManager.init();

      await this.initRenderer();
      this.setupEventListeners();

      // Connect to SignalR
      try {
         await this._signalRManager.connect();
         console.log("SignalR connected successfully");
      } catch (error) {
         console.error("Failed to connect to SignalR:", error);
      }

       this._uiManager.showStationSelectionScreen(async (layout: string, playerId: string, playerName?: string) => {
          await this.handleStationSelection(layout, playerId, playerName);
      });
   }

   private async handleStationSelection(layout: string, playerId: string, playerName?: string): Promise<void> {
      console.log("Selected layout:", layout, "Player ID:", playerId, "Player Name:", playerName);
      
      try {
         // Join the station via SignalR for real-time updates
         await this._signalRManager.joinStation(playerId, layout, playerName);
         console.log('Successfully joined station via SignalR');
         
         // Store the player ID and station ID, then load the layout
         this._currentPlayerId = playerId;
         this._currentStationId = layout;
         this._trackLayoutManager.loadTrackLayout(layout);
         
         // Show the control panel and train overview panel after successfully joining a station
         this._uiManager.showTrainOverviewPanel();
         this._uiManager.showTestingPanel();
         
      } catch (error) {
         console.error('Failed to join station:', error);
         alert(`Fehler beim Übernehmen der Station: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
         
         // Show the station selector again if there was an error
          this._uiManager.showStationSelectionScreen(async (layout: string, playerId: string, playerName?: string) => {
             this.handleStationSelection(layout, playerId, playerName);
         });
      }
   }

   private async initRenderer(): Promise<void> {
      const canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
      if (canvas) {
         this._renderer = await Renderer.create(canvas, this._trackLayoutManager, this._eventManager, this._trainManager);
         this._trackLayoutManager.setRenderer(this._renderer);
         
         // Set up callback to render when layout is loaded
         this._trackLayoutManager.setOnLayoutLoaded(() => {
            if (this._renderer) {
               this._renderer.renderTrackLayout();
            }
         });
         
         console.log("Renderer initialized");
      } else {
         console.error("Canvas element not found");
      }
   }

   private setupEventListeners(): void {
      // Signal clicked → try to create route and prevent toggle if it fails
      // IMPORTANT: Register this FIRST using prepend to ensure it runs before trackLayout_manager's handler
      this._eventManager.prepend('signalClicked', (event: CancellableEvent, signal: Signal) => {
         if (!this._renderer) return;
         
         // Store the original signal state before any potential toggle
         // signal.state: true = green/go, false = red/stop
         const wasRed = !signal.state;
         
         // Check if signal is currently red (would transition to green)
         if (wasRed && signal.track) {
            // Try to create the route - if it fails, prevent the toggle
            const route = this._trainRouteManager.createAndStoreRoute(
               { track: signal.track, km: signal.position },
               signal.direction,
               signal // Pass the signal so we can remove routes later
            );
            
            if (!route) {
               // Route creation failed - prevent the signal toggle
               event.preventDefault();
               console.warn("Cannot create route from signal (route would end at a switch). Signal remains red.");
               Toast.show("Fahrstellung nicht möglich, da keine Fahrstraße gefunden wurde.", 'warning');
               return;
            }
         }
      });

      // Long click on signal → manually remove train route (signal must be red/stop)
      this._eventManager.on('signalLongClicked', (signal: Signal) => {
         if (!this._renderer) return;
         if (signal.state) return; // Not set to stop, do nothing
         const removed = this._trainRouteManager.removeRoutesBySignal(signal);
         if (removed) {
            const blockedExitId = this._signalBlockedExits.get(signal);
            if (blockedExitId !== undefined) {
               this._signalRManager.setExitBlockStatus(blockedExitId, false);
               this._signalBlockedExits.delete(signal);
            }
         }
      });

      // Signal state changed → handle route removal if signal turned red
      this._eventManager.on('signalStateChanged', (signal: Signal) => {
         if (!this._renderer) return;
         
         // If signal turned red, remove routes associated with this signal
         if (!signal.state) {
            this._trainRouteManager.removeRoutesBySignal(signal);
            
            // Check if this signal was blocking an exit and unblock it
            const blockedExitId = this._signalBlockedExits.get(signal);
            if (blockedExitId !== undefined) {
               this._signalRManager.setExitBlockStatus(blockedExitId, false);
               this._signalBlockedExits.delete(signal);
               console.log(`Signal turned red, unblocking exit ${blockedExitId}`);
            }
         }
      });

      // Route created → render the routes
      this._eventManager.on('routeCreated', () => {
         if (!this._renderer) return;
         this._renderer.renderTrainRoutes(this._trainRouteManager.routes);
      });

      // Routes cleared → render (empty routes)
      this._eventManager.on('routesCleared', () => {
         if (!this._renderer) return;
         this._renderer.renderTrainRoutes(this._trainRouteManager.routes);
      });

      // Simulation speed change events (from server)
      this._eventManager.on('simulationSpeedChanged', (speed: number) => {
         if (typeof speed === 'number' && !isNaN(speed)) {
            SimulationConfig.simulationSpeed = Math.max(0.1, Math.min(100, speed));
         }
      });

      this._eventManager.on('routeEndedAtExit', (route: TrainRoute, exit: Exit) => {
         this._signalRManager.setExitBlockStatus(exit.id, true);
         
         // Track which signal is blocking this exit so we can unblock it later
         if (route.signal) {
            this._signalBlockedExits.set(route.signal, exit.id);
            console.log(`Signal is blocking exit ${exit.id}`);
         }
      });

      // Route with exit cleared → notify server that exit is unblocked
      this._eventManager.on('routeWithExitCleared', (exit: Exit) => {
         this._signalRManager.setExitBlockStatus(exit.id, false);
         console.log(`Exit ${exit.id} blocking route fully cleared, reporting unblock`);
      });

      // Exit block status changed (from server) → create or remove blocking route
      this._eventManager.on('exitBlockStatusChanged', (exitId: number, blocked: boolean) => {
         this.handleExitBlockStatusChanged(exitId, blocked);
      });

      console.log("Event listeners setup complete");
   }

   private handleExitBlockStatusChanged(exitId: number, blocked: boolean): void {
      if (blocked) {
         // Station B: Create blocking route from exit
         const location = this._trackLayoutManager.getExitPointLocation(exitId);
         const direction = this._trackLayoutManager.getExitPointDirection(exitId);
         
         if (!location.track) {
            console.error(`Cannot create route: exit ${exitId} track not found`);
            return;
         }
         
         // Get the exit object to pass to the route
         const exit = this._trackLayoutManager.getExitById(exitId);
         
         const startPoint = {
            track: location.track,
            km: location.km
         };
         
         // Create route and pass the exit so it's stored in the route
         const route = this._trainRouteManager.createAndStoreRoute(startPoint, direction, null, exit);
         
         if (route) {
            console.log(`Created blocking route from exit ${exitId} to next signal`);
         } else {
            console.warn(`Failed to create blocking route for exit ${exitId}`);
         }
      } else {
         // BOTH stations handle unblock:
         // Find and remove any route associated with this exit
         const routeAtExit = this._trainRouteManager.routes.find(r => r.exit?.id === exitId);
         if (routeAtExit) {
            this._trainRouteManager.removeRoute(routeAtExit);
            console.log(`Removed route for exit ${exitId} after receiving unblock`);
            
            // Also clear the signal tracking if this was a signal-based route
            if (routeAtExit.signal) {
               this._signalBlockedExits.delete(routeAtExit.signal);
            }
         }
      }
   }

   public async removeTrainAndReport(trainNumber: string): Promise<void> {
      // Remove locally and mark completed on server
      if (!this._currentPlayerId || !this._currentStationId) {
         console.error('Cannot remove train: No current player ID or station ID');
         return;
      }

      try {
         await this._signalRManager.reportTrainRemoved(this._currentPlayerId, trainNumber, this._currentStationId);
      } catch (error) {
         console.error(`Application: Failed to report train removed ${trainNumber}:`, error);
      }

      this._trainManager.removeTrain(trainNumber);
      this._eventManager.emit('trainsUpdated');
   }

   // No server collision handler needed


 


   get uiManager(): UIManager {
      return this._uiManager;
   }

   get eventManager(): EventManager {
      return this._eventManager;
   }

   get currentPlayerId(): string | null {
      return this._currentPlayerId;
   }

   get currentStationId(): string | null {
      return this._currentStationId;
   }

   get signalRManager(): SignalRManager {
      return this._signalRManager;
   }

   get trains(): Train[] {
      return this._trainManager.getAllTrains();
   }

   get trainManager(): TrainManager {
      return this._trainManager;
   }

   get trackLayoutManager(): TrackLayoutManager {
      return this._trackLayoutManager;
   }

   get trainRouteManager(): TrainRouteManager {
      return this._trainRouteManager;
   }

   get clientSimulation(): ClientSimulation {
      return this._clientSimulation;
   }

   public async handleReconnection(): Promise<void> {
      const lastStationInfo = this._signalRManager.lastStationInfo;
      if (lastStationInfo.playerId && lastStationInfo.stationId) {
         console.log('Application: Attempting to rejoin station after reconnection');
         try {
            await this.handleStationSelection(lastStationInfo.stationId, lastStationInfo.playerId);
         } catch (error) {
            console.error('Application: Failed to rejoin station after reconnection:', error);
         }
      }
   }

   // Reset app UI and state to start screen (used on final disconnect)
   public async resetToStartScreen(): Promise<void> {
      try {
         // Stop any running simulation and clear trains
         this._clientSimulation.stopSimulation();

         // Clear canvas contents
         if (this._renderer) {
            this._renderer.clear();
         }

         // Reset current selections/state
         this._currentPlayerId = null;
         this._currentStationId = null;

         // Show station selection again
         this._uiManager.showStationSelectionScreen(async (layout: string, playerId: string, playerName?: string) => {
            await this.handleStationSelection(layout, playerId, playerName);
         });
      } catch (err) {
         console.error('Application: Error during resetToStartScreen', err);
      }
   }
}

export default Application;
