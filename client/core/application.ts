import { UIManager } from "../manager/ui_manager";
import { EventManager } from "../manager/event_manager";
import { TrackLayoutManager } from "../manager/trackLayout_manager";
import { TrainManager } from "../manager/train_manager";
import { Renderer } from "../canvas/renderer";
import Switch from "../sim/switch";
import SignalRManager from "../network/signalr";
import Train from "../sim/train";

export class Application {
   private _uiManager: UIManager;
   private _eventManager: EventManager;
   private _trackLayoutManager: TrackLayoutManager;
   private _trainManager: TrainManager;
   private _renderer: Renderer | null = null;
   private _currentPlayerId: string | null = null;
   private _signalRManager: SignalRManager;

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

      this._uiManager.showStationSelectionScreen(async (layout: string, playerId: string) => {
         console.log("Selected layout:", layout, "Player ID:", playerId);
         
         try {
            // Join the station via SignalR for real-time updates
            await this._signalRManager.joinStation(playerId, layout);
            console.log('Successfully joined station via SignalR');
            
            // Store the player ID and load the layout
            this._currentPlayerId = playerId;
            this._trackLayoutManager.loadTrackLayout(layout);
            
         } catch (error) {
            console.error('Failed to join station:', error);
            alert(`Fehler beim Übernehmen der Station: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
            
            // Show the station selector again if there was an error
            this._uiManager.showStationSelectionScreen(async (layout: string, playerId: string) => {
               this.handleStationSelection(layout, playerId);
            });
         }
      });
   }

   private async handleStationSelection(layout: string, playerId: string): Promise<void> {
      console.log("Selected layout:", layout, "Player ID:", playerId);
      
      try {
         // Join the station via SignalR for real-time updates
         await this._signalRManager.joinStation(playerId, layout);
         console.log('Successfully joined station via SignalR');
         
         // Store the player ID and load the layout
         this._currentPlayerId = playerId;
         this._trackLayoutManager.loadTrackLayout(layout);
         
         // Show the control panel after successfully joining a station
         this._uiManager.showControlPanel();
         
      } catch (error) {
         console.error('Failed to join station:', error);
         alert(`Fehler beim Übernehmen der Station: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
         
         // Show the station selector again if there was an error
         this._uiManager.showStationSelectionScreen(async (layout: string, playerId: string) => {
            this.handleStationSelection(layout, playerId);
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
      this._eventManager.on('sendTrainToServer', async (trainNumber: string, destinationStationId: string) => {
         await this.handleSendTrainToServer(trainNumber, destinationStationId);
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

   private async handleSendTrainToServer(trainNumber: string, destinationStationId: string): Promise<void> {
      if (!this._currentPlayerId) {
         console.error('Cannot send train: No current player ID');
         return;
      }

      try {
         console.log(`Application: Sending train ${trainNumber} to server for destination ${destinationStationId}`);
         await this._signalRManager.sendTrain(this._currentPlayerId, trainNumber, destinationStationId);
         console.log(`Application: Successfully initiated sending train ${trainNumber} to ${destinationStationId}`);
      } catch (error) {
         console.error(`Application: Failed to send train ${trainNumber}:`, error);
      }
   }

   // Method to manually add a test train for demonstration
   public addTestTrain(trainNumber: string): void {
      // Get the first available exit point for testing
      const exits = this._trackLayoutManager.exits;
      if (exits.length > 0) {
         const testTrain = new Train(trainNumber, null, 0);
         const firstExitId = exits[0].id.toString();
         this._trainManager.addTrainAtExitPoint(testTrain, firstExitId);
      } else {
         console.warn("No exit points available for test train");
      }
   }

   


   get uiManager(): UIManager {
      return this._uiManager;
   }

   get eventManager(): EventManager {
      return this._eventManager;
   }

   get currentPlayerId(): string | null {
      return this._currentPlayerId;
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
}

export default Application;
