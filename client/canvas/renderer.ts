import * as PIXI from "pixi.js";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Train from "../sim/train";
import Signal from "../sim/signal";
import TrackLayoutManager from "../manager/trackLayout_manager";
import { EventManager } from "../manager/event_manager";
import { TrainManager } from "../manager/train_manager";
import { RendererConfig } from "../core/config";
import { Camera } from "./camera";
import { InputHandler } from "./input_handler";
import { TrackRenderer } from "./renderers/track_renderer";
import { PlatformRenderer } from "./renderers/platform_renderer";
import { SwitchRenderer } from "./renderers/switch_renderer";
import { SignalRenderer } from "./renderers/signal_renderer";
import { TrainRenderer } from "./renderers/train_renderer";
import { StationRenderer } from "./renderers/station_renderer";
import { TrainRouteRenderer } from "./renderers/trainRoute_renderer";
import TrainRoute from "../sim/trainRoute";

export class Renderer {
   private _pixiApp: PIXI.Application;
   private _camera!: Camera;
   private _inputHandler!: InputHandler;
   private _trackRenderer!: TrackRenderer;
   private _platformRenderer!: PlatformRenderer;
   private _switchRenderer!: SwitchRenderer;
   private _signalRenderer!: SignalRenderer;
   private _trainRenderer!: TrainRenderer;
   private _stationRenderer!: StationRenderer;
   private _trainRouteRenderer!: TrainRouteRenderer;
   private _trackLayoutManager: TrackLayoutManager;
   private _eventManager: EventManager;
   private _trainManager: TrainManager;

   private constructor(canvas: HTMLCanvasElement, trackLayoutManager: TrackLayoutManager, eventManager: EventManager, trainManager: TrainManager) {
      this._pixiApp = new PIXI.Application();
      this._trackLayoutManager = trackLayoutManager;
      this._eventManager = eventManager;
      this._trainManager = trainManager;
   }

   static async create(canvas: HTMLCanvasElement, trackLayoutManager: TrackLayoutManager, eventManager: EventManager, trainManager: TrainManager): Promise<Renderer> {
      const r = new Renderer(canvas, trackLayoutManager, eventManager, trainManager);
      await r._pixiApp.init({
         canvas: canvas,
         resizeTo: window,
         backgroundColor: RendererConfig.backgroundColor,
         antialias: true,
         resolution: window.devicePixelRatio || 1,
         autoDensity: true,
      });

      // Initialize camera and input handler
      r._camera = new Camera(r._pixiApp.stage, canvas);
      r._inputHandler = new InputHandler(canvas, r._camera, eventManager);

      // Debug: log display object under cursor on click
      r._pixiApp.stage.eventMode = "static";
      r._pixiApp.stage.on("click", (event) => {
         const target = (event as any).target as any;
         const info: Record<string, unknown> = {};
         let current: any = target;
         let hops = 0;
         while (current && hops < 6) {
            if (current.switchId !== undefined) info.switchId = current.switchId;
            if (current.signalTrackId !== undefined) info.signalTrackId = current.signalTrackId;
            if (current.signalPosition !== undefined) info.signalPosition = current.signalPosition;
            if (current.trainNumber !== undefined) info.trainNumber = current.trainNumber;
            if (current.exitId !== undefined) info.exitId = current.exitId;
            if (current.trackId !== undefined) info.trackId = current.trackId;
            current = current.parent;
            hops++;
         }

         // If we clicked a track, also compute the km along that track (project click point onto the track vector)
         if (typeof info.trackId === "number") {
            const clickedTrack = r._trackLayoutManager.tracks.find((t) => t.id === info.trackId);
            const globalPoint = (event as any).global as { x: number; y: number } | undefined;
            if (clickedTrack && globalPoint) {
               const localPoint = r._pixiApp.stage.toLocal(globalPoint as any);
               const dx = localPoint.x - clickedTrack.start.x;
               const dy = localPoint.y - clickedTrack.start.y;
               const kmRaw = dx * clickedTrack.unit.x + dy * clickedTrack.unit.y;
               const kmClamped = Math.max(0, Math.min(clickedTrack.length, kmRaw));
               info.trackKm = Math.round(kmClamped * 1000) / 1000;
            }
         }

         // Always log the raw target; add tags when available
         if (Object.keys(info).length > 0) {
            console.log("[Debug Click] Target:", target, "Tags:", info);
         } else {
            console.log("[Debug Click] Target:", target);
         }
      });

      // Handle WebGL context loss/restoration
      const view = r._pixiApp.canvas;
      view.addEventListener("webglcontextlost", r.handleWebGLContextLost as any, false);
      view.addEventListener("webglcontextrestored", r.handleWebGLContextRestored as any, false);

      // Initialize renderers in z-order (bottom to top)
      // Routes must be rendered before trains so trains appear on top
      r._trackRenderer = new TrackRenderer(r._pixiApp.stage, trackLayoutManager);
      r._platformRenderer = new PlatformRenderer(r._pixiApp.stage, trackLayoutManager);
      r._switchRenderer = new SwitchRenderer(r._pixiApp.stage, eventManager, canvas);
      r._signalRenderer = new SignalRenderer(r._pixiApp.stage, eventManager, canvas);
      r._trainRouteRenderer = new TrainRouteRenderer(r._pixiApp.stage);
      r._trainRenderer = new TrainRenderer(r._pixiApp.stage, trackLayoutManager, eventManager, canvas, trainManager);
      r._stationRenderer = new StationRenderer(r._pixiApp.stage, trackLayoutManager);


      // Listen for train events and update renderer
      r._eventManager.on('trainAdded', (train: Train) => {
         r._trainRenderer.renderTrain(train);
      });

      // Listen for simulation updates and update renderer
      r._eventManager.on('trainsUpdated', (trains: Train[]) => {
         r._trainRenderer.renderAll();
      });

      r._eventManager.on('trainUpdated', (train: Train) => {
         r._trainRenderer.renderTrain(train);
      });

      // Handle window resize
      window.addEventListener("resize", r.handleResize.bind(r));

      return r;
   }

   private handleResize(): void {
      //this._pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
   }

   private handleWebGLContextLost = (e: Event): void => {
      try {
         (e as any).preventDefault?.();
      } catch {}
      console.warn("Renderer: WebGL context lost. Preventing default and awaiting restore.");
   };

   private handleWebGLContextRestored = (): void => {
      console.info("Renderer: WebGL context restored. Redrawing all GUI elements.");
      // Rebuild stage contents
      this.renderTrackLayout();
      // Request trains redraw (handled by own subscription)
      this.renderTrains();
   };

   public renderTrackLayout(): void {
      // Clear previous content
      this.clear();

      const tracks = this._trackLayoutManager.tracks;
      const switches = this._trackLayoutManager.switches;
      const platforms = this._trackLayoutManager.platforms;

      // Render station name
      this._stationRenderer.renderStationName();

      // Render tracks
      this._trackRenderer.renderAll(tracks);

      // Render platforms (on top of tracks, below switches/signals)
      this._platformRenderer.renderAll(platforms);

      // Render switches
      this._switchRenderer.renderAll(switches);

      // Render signals
      this._signalRenderer.renderAll(tracks);

      // Auto-zoom to fit on first load
      this._camera.zoomToFit(tracks, this._pixiApp.canvas.width, this._pixiApp.canvas.height);
   }

   public renderTrains(): void {
      this._trainRenderer.renderAll();
   }

   public redrawSwitch(sw: Switch): void {
      this._switchRenderer.redrawSwitch(sw);
   }

   public redrawSignal(signal: Signal): void {
      this._signalRenderer.redrawSignal(signal);
   }



   public renderTrainRoutes(routes: TrainRoute[]): void {
      this._trainRouteRenderer.renderAll(routes);
   }

   public clear(): void {
      this._trackRenderer.clear();
      this._platformRenderer.clear();
      this._switchRenderer.clear();
      this._signalRenderer.clear();
      this._trainRenderer.clear();
      this._stationRenderer.clear();
      this._trainRouteRenderer.clear();
   }

   public getCurrentZoom(): number {
      return this._camera.getCurrentZoom();
   }

   public setZoom(zoom: number): void {
      this._camera.setZoom(zoom);
   }
}
