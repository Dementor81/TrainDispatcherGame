import { UIManager } from "../manager/ui_manager";
import { EventManager } from "../manager/event_manager";
import { TrackLayoutManager } from "../manager/trackLayout_manager";
import { TrainManager } from "../manager/train_manager";
import { Renderer } from "../canvas/renderer";
import Switch from "../sim/switch";
import SignalRManager from "../network/signalr";
import Train from "../sim/train";
import { getSimulationStatus } from "../network/api";
import { SimulationState } from "../network/dto";

export class Application {
   private _uiManager: UIManager;
   private _eventManager: EventManager;
   private _trackLayoutManager: TrackLayoutManager;
   private _trainManager: TrainManager;
   private _renderer: Renderer | null = null;
   private _currentPlayerId: string | null = null;
   private _currentStationId: string | null = null;
   private _signalRManager: SignalRManager;
   private _simulationState: SimulationState = 'Stopped';

   constructor() {
      this._uiManager = new UIManager(this);
      this._eventManager = new EventManager(this);
      this._trackLayoutManager = new TrackLayoutManager(this);
      this._trainManager = new TrainManager(this._eventManager, this._trackLayoutManager);
      this._signalRManager = new SignalRManager(this._eventManager);

      (window as any).app = this;
   }

   async init() {
      console.log("TrainSim Client gestartet");
      
      this._uiManager.init();
      this._eventManager.init();

      this.initRenderer();
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

         // Retrieve simulation state from the server and handle accordingly
         try {
            const status = await getSimulationStatus();
            this._simulationState = status.state;
            this._eventManager.emit('simulationStateChanged', this._simulationState);            
         } catch (error) {
            console.error("Failed to retrieve simulation state:", error);
         }
         
      } catch (error) {
         console.error('Failed to join station:', error);
         alert(`Fehler beim Übernehmen der Station: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
         
         // Show the station selector again if there was an error
          this._uiManager.showStationSelectionScreen(async (layout: string, playerId: string, playerName?: string) => {
             this.handleStationSelection(layout, playerId, playerName);
         });
      }
   }

   private initRenderer(): void {
      const canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
      if (canvas) {
         this._renderer = new Renderer(canvas, this._trackLayoutManager, this._eventManager);
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
      
      // Listen for train events and update renderer
      this._eventManager.on('trainAdded', (train: Train) => {
         this.handleTrainAdded(train);
      });

      // Listen for simulation updates and update renderer
      this._eventManager.on('trainsUpdated', (trains: Train[]) => {
         this.handleTrainUpdated(trains);
      });

      // Train sending events
      this._eventManager.on('sendTrainToServer', async (trainNumber: string, exitId: string) => {
         await this.handleSendTrainToServer(trainNumber, exitId);
      });

      // Train stop events
      this._eventManager.on('trainStoppedAtStation', async (train: Train) => {
         await this.handleTrainStoppedAtStation(train);
      });

      // Train departure events
      this._eventManager.on('trainDepartedFromStation', async (train: Train) => {
         await this.handleTrainDepartedFromStation(train);
      });

      // Local collision detection from client sim
      this._eventManager.on('trainCollision', async (trainA: Train, trainB: Train) => {
         await this.handleLocalTrainCollision(trainA, trainB);
      });

      // No server broadcast for collisions; client handles it directly

      // Connection status events
      this._eventManager.on('connectionStatusChanged', (state: string) => {
         // No direct app-level reaction for now; state available if needed
      });

      // Simulation state change events
      this._eventManager.on('simulationStateChanged', (state: SimulationState) => {
         this.handleSimulationStateChanged(state);
      });
      
      console.log("Event listeners setup complete");
   }

   private handleTrainAdded(train: Train): void {
      console.log(`Application: Train ${train.number} added, updating renderer`);
      if (this._renderer) {
         // Re-render all trains
         this._renderer.renderTrains(this._trainManager.getAllTrains());
      }
   }

   private handleTrainUpdated(trains: Train[]): void {
      if (this._renderer) {
         this._renderer.renderTrains(trains);
      }
   }

   private async handleSendTrainToServer(trainNumber: string, exitId: string): Promise<void> {
      if (!this._currentPlayerId) {
         console.error('Cannot send train: No current player ID');
         return;
      }
      try {         
         await this._signalRManager.sendTrain(this._currentPlayerId, trainNumber, exitId);
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

   private handleSimulationStateChanged(state: SimulationState): void {     
      this._simulationState = state;
      
      // Update the train manager simulation state based on server state
      switch (state.toLowerCase()) {
         case 'running':
            this._trainManager.resumeSimulation();
            console.log('Application: Resumed client simulation');
            break;
         case 'paused':
            this._trainManager.pauseSimulation();
            console.log('Application: Paused client simulation');
            break;
         case 'stopped':
            this._trainManager.stopSimulation();
            console.log('Application: Stopped client simulation');
            break;
         default:
            console.log(`Application: Unknown simulation state: ${state}`);
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

   get simulationState(): SimulationState {
      return this._simulationState;
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
}

export default Application;
