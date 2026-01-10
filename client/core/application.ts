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

   constructor() {
      this._eventManager = new EventManager();
      this._signalRManager = new SignalRManager(this._eventManager);
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
      
      // Set up the simulation stop callback
      this._clientSimulation.setStopCallback(() => {
         this._trainManager.stopSimulation(); // Clear trains
         ApprovalToast.clearAll(); // Clear any outstanding approval toasts
      });
   }

   async init() {
      this._uiManager.init();
      this._eventManager.init();

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

      // Signal state changed → handle route removal if signal turned red
      this._eventManager.on('signalStateChanged', (signal: Signal) => {
         if (!this._renderer) return;
         
         // If signal turned red, remove routes associated with this signal
         if (!signal.state) {
            this._trainRouteManager.removeRoutesBySignal(signal);
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

      // Occupied track cleared → remove cleared track from routes
      this._eventManager.on('occupiedTrackCleared', (clearedTrack: Track) => {
         this._trainRouteManager.removeClearedTrack(clearedTrack);
      });

      // Simulation speed change events (from server)
      this._eventManager.on('simulationSpeedChanged', (speed: number) => {
         if (typeof speed === 'number' && !isNaN(speed)) {
            SimulationConfig.simulationSpeed = Math.max(0.1, Math.min(100, speed));
         }
      });

      console.log("Event listeners setup complete");
   }

  private async handleSendTrainToServer(trainNumber: string, exitId: number): Promise<void> {
      if (!this._currentPlayerId) {
         console.error('Cannot send train: No current player ID');
         return;
      }
      try {         
         
         console.log(`Application: Successfully initiated sending train ${trainNumber} to ${exitId}`);
      } catch (error) {
         console.error(`Application: Failed to send train ${trainNumber}:`, error);
      }
   }

   private async handleTrainStoppedAtStation(train: Train): Promise<void> {
      if (!this._currentPlayerId || !this._currentStationId) {
         console.error('Cannot report train stopped: No current player ID or station ID');
         return;
      }

      try {
         console.log(`Application: Reporting train ${train.number} stopped at station ${this._currentStationId}`);
         await this._signalRManager.reportTrainStopped(this._currentPlayerId, train.number, this._currentStationId);
      } catch (error) {
         console.error(`Application: Failed to report train ${train.number} stopped:`, error);
      }
   }

   private async handleTrainDepartedFromStation(train: Train): Promise<void> {
      if (!this._currentPlayerId || !this._currentStationId) {
         console.error('Cannot report train departed: No current player ID or station ID');
         return;
      }

      try {
         console.log(`Application: Reporting train ${train.number} departed from station ${this._currentStationId}`);
         await this._signalRManager.reportTrainDeparted(this._currentPlayerId, train.number, this._currentStationId);
      } catch (error) {
         console.error(`Application: Failed to report train ${train.number} departed:`, error);
      }
   }

   private async handleLocalTrainCollision(trainA: Train, trainB: Train): Promise<void> {
      if (this._currentPlayerId && this._currentStationId) {
         try {
            await this._signalRManager.reportTrainCollision(this._currentPlayerId, trainA.number, trainB.number, this._currentStationId);
         } catch (error) {
            console.error('Failed to report train collision to server:', error);
         }
      }

      this._uiManager.notifyCollision(trainA.number, trainB.number);
      this._trainManager.removeTrain(trainA.number);
      this._trainManager.removeTrain(trainB.number);
   }

   private async handleLocalTrainDerailment(train: Train, sw?: Switch): Promise<void> {
      if (this._currentPlayerId && this._currentStationId) {
         try {
            await this._signalRManager.reportTrainDerailed(this._currentPlayerId, train.number, this._currentStationId, sw?.id);
         } catch (error) {
            console.error('Failed to report train derailment to server:', error);
         }
      }

      this._uiManager.notifyDerailment(train.number, sw?.id);
      // Ensure removal in case not already removed by TrainManager
      this._trainManager.removeTrain(train.number);
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
      this._eventManager.emit('trainsUpdated', this._trainManager.getAllTrains());
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
         this._trainManager.clearAllTrains();

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
