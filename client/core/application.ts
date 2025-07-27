import { UIManager } from "../manager/ui_manager";
import { EventManager } from "../manager/event_manager";
import { TrackLayoutManager } from "../manager/trackLayout_manager";
import { Renderer } from "../canvas/renderer";
import Switch from "../sim/switch";
import SignalRManager from "../network/signalr";

export class Application {
   private _uiManager: UIManager;
   private _eventManager: EventManager;
   private _trackLayoutManager: TrackLayoutManager;
   private _renderer: Renderer | null = null;
   private _currentPlayerId: string | null = null;
   private _signalRManager: SignalRManager;

   constructor() {
      this._uiManager = new UIManager(this);
      this._eventManager = new EventManager(this);
      this._trackLayoutManager = new TrackLayoutManager(this);
      this._signalRManager = new SignalRManager();
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
      // Listen for switch click events
      
   }

   private handleSwitchClick(sw: Switch): void {
      // Toggle the switch state
      sw.toggle();
      
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
}

export default Application;
