import * as PIXI from "pixi.js";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Train from "../sim/train";
import Signal from "../sim/signal";
import TrackLayoutManager from "../manager/trackLayout_manager";
import { EventManager } from "../manager/event_manager";
import { RendererConfig } from "../core/config";
import { Camera } from "./camera";
import { InputHandler } from "./input_handler";
import { TrackRenderer } from "./renderers/track_renderer";
import { SwitchRenderer } from "./renderers/switch_renderer";
import { SignalRenderer } from "./renderers/signal_renderer";
import { TrainRenderer } from "./renderers/train_renderer";
import { StationRenderer } from "./renderers/station_renderer";

export class Renderer {
   private _pixiApp: PIXI.Application;
   private _camera: Camera;
   private _inputHandler: InputHandler;
   private _trackRenderer: TrackRenderer;
   private _switchRenderer: SwitchRenderer;
   private _signalRenderer: SignalRenderer;
   private _trainRenderer: TrainRenderer;
   private _stationRenderer: StationRenderer;
   private _trackLayoutManager: TrackLayoutManager;
   private _eventManager: EventManager;

   constructor(canvas: HTMLCanvasElement, trackLayoutManager: TrackLayoutManager, eventManager: EventManager) {
      // Create PIXI application
      this._pixiApp = new PIXI.Application();
      this._pixiApp.init({
         canvas: canvas,
         resizeTo: window,
         backgroundColor: RendererConfig.backgroundColor,
         antialias: true,
         resolution: window.devicePixelRatio || 1,
         autoDensity: true,
      });

      this._trackLayoutManager = trackLayoutManager;
      this._eventManager = eventManager;

      // Initialize camera and input handler
      this._camera = new Camera(this._pixiApp.stage, canvas);
      this._inputHandler = new InputHandler(canvas, this._camera, eventManager);

      // Initialize renderers
      this._trackRenderer = new TrackRenderer(this._pixiApp.stage, trackLayoutManager);
      this._switchRenderer = new SwitchRenderer(this._pixiApp.stage, eventManager, canvas);
      this._signalRenderer = new SignalRenderer(this._pixiApp.stage, eventManager, canvas);
      this._trainRenderer = new TrainRenderer(this._pixiApp.stage, trackLayoutManager);
      this._stationRenderer = new StationRenderer(this._pixiApp.stage, trackLayoutManager);

      // Set up event listeners
      this._eventManager.on('trainRemoved', (trainNumber: string) => {
         this._trainRenderer.removeTrain(trainNumber);
      });

      // Handle window resize
      window.addEventListener("resize", this.handleResize.bind(this));
   }

   private handleResize(): void {
      //this._pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
   }

   public renderTrackLayout(): void {
      // Clear previous content
      this.clear();

      const tracks = this._trackLayoutManager.tracks;
      const switches = this._trackLayoutManager.switches;

      // Render station name
      this._stationRenderer.renderStationName();

      // Render tracks
      this._trackRenderer.renderAll(tracks);

      // Render switches
      this._switchRenderer.renderAll(switches);

      // Render signals
      this._signalRenderer.renderAll(tracks);

      // Auto-zoom to fit on first load
      this._camera.zoomToFit(tracks, this._pixiApp.canvas.width, this._pixiApp.canvas.height);
   }

   public renderTrains(trains: Train[]): void {
      this._trainRenderer.renderAll(trains);
   }

   public redrawSwitch(sw: Switch): void {
      this._switchRenderer.redrawSwitch(sw);
   }

   public redrawSignal(signal: Signal, track: Track): void {
      this._signalRenderer.redrawSignal(signal, track);
   }

   public redrawTrain(train: Train): void {
      this._trainRenderer.redrawTrain(train);
   }

   public clear(): void {
      this._trackRenderer.clear();
      this._switchRenderer.clear();
      this._signalRenderer.clear();
      this._trainRenderer.clear();
      this._stationRenderer.clear();
   }

   public getCurrentZoom(): number {
      return this._camera.getCurrentZoom();
   }

   public setZoom(zoom: number): void {
      this._camera.setZoom(zoom);
   }
}
