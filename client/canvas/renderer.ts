import * as PIXI from "pixi.js";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Train from "../sim/train";
import TrackLayoutManager from "../manager/trackLayout_manager";
import { EventManager } from "../manager/event_manager";
import { RendererConfig } from "../core/config";
import Exit from "../sim/exit";
import { Point } from "../utils/point";
import { drawArrow } from "./pixi_extension";

interface SwitchContainer extends PIXI.Container {
   switchId?: number;
}

interface ExitContainer extends PIXI.Container {
   exitId?: number;
}

interface TrainContainer extends PIXI.Container {
   trainNumber?: string;
}

export class Renderer {
   private _pixiApp: PIXI.Application;
   private _trackContainer: PIXI.Container;
   private _switchContainer: PIXI.Container;
   private _exitContainer: PIXI.Container;
   private _trainContainer: PIXI.Container;
   private _trackLayoutManager: TrackLayoutManager;
   private _eventManager: EventManager;

   // Zoom and pan state
   private _isDragging = false;
   private _dragStart = { x: 0, y: 0 };
   private _stageStart = { x: 0, y: 0 };
   private _currentZoom = 1;
   private _minZoom = 0.1;
   private _maxZoom = 5;

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

      // Create containers for different elements
      this._trackContainer = new PIXI.Container();
      this._switchContainer = new PIXI.Container();
      this._exitContainer = new PIXI.Container();
      this._trainContainer = new PIXI.Container();
      // Add containers directly to the stage
      this._pixiApp.stage.addChild(this._trackContainer);
      this._pixiApp.stage.addChild(this._switchContainer);
      this._pixiApp.stage.addChild(this._exitContainer);
      this._pixiApp.stage.addChild(this._trainContainer);

      this._trackLayoutManager = trackLayoutManager;
      this._eventManager = eventManager;

      // Setup interactive controls
      this.setupInteractivity(canvas);

      // Handle window resize
      window.addEventListener("resize", this.handleResize.bind(this));
   }

   private setupInteractivity(canvas: HTMLCanvasElement): void {
      // Mouse wheel zoom
      canvas.addEventListener("wheel", (e) => {
         e.preventDefault();
         this.handleZoom(e);
      });

      // Mouse drag pan
      canvas.addEventListener("mousedown", (e) => {
         this.handleMouseDown(e);
      });

      canvas.addEventListener("mousemove", (e) => {
         this.handleMouseMove(e);
      });

      canvas.addEventListener("mouseup", (e) => {
         this.handleMouseUp(e);
      });

      // Touch support for mobile
      canvas.addEventListener("touchstart", (e) => {
         e.preventDefault();
         if (e.touches.length === 1) {
            this.handleTouchStart(e);
         }
      });

      canvas.addEventListener("touchmove", (e) => {
         e.preventDefault();
         if (e.touches.length === 1) {
            this.handleTouchMove(e);
         }
      });

      canvas.addEventListener("touchend", () => {
         this.handleTouchEnd();
      });
   }

   private handleZoom(e: WheelEvent): void {
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(this._minZoom, Math.min(this._maxZoom, this._currentZoom * zoomFactor));

      if (newZoom !== this._currentZoom) {
         const rect = this._pixiApp.canvas.getBoundingClientRect();
         const mouseX = e.clientX - rect.left;
         const mouseY = e.clientY - rect.top;

         this.zoomAtPoint(mouseX, mouseY, newZoom);
      }
   }

   private zoomAtPoint(x: number, y: number, newZoom: number): void {
      const oldZoom = this._currentZoom;
      this._currentZoom = newZoom;

      // Calculate zoom center in world coordinates
      const worldX = (x - this._pixiApp.stage.x) / oldZoom;
      const worldY = (y - this._pixiApp.stage.y) / oldZoom;

      // Update stage transform
      this._pixiApp.stage.scale.set(newZoom);
      this._pixiApp.stage.x = x - worldX * newZoom;
      this._pixiApp.stage.y = y - worldY * newZoom;
   }

   private handleMouseDown(e: MouseEvent): void {
      if (e.button == 0) {
         this._isDragging = true;
         this._dragStart = { x: e.clientX, y: e.clientY };
         this._stageStart = { x: this._pixiApp.stage.x, y: this._pixiApp.stage.y };
         this._pixiApp.canvas.style.cursor = "grabbing";
      }
   }

   private handleMouseMove(e: MouseEvent): void {
      if (this._isDragging) {
         const deltaX = e.clientX - this._dragStart.x;
         const deltaY = e.clientY - this._dragStart.y;

         this._pixiApp.stage.x = this._stageStart.x + deltaX;
         this._pixiApp.stage.y = this._stageStart.y + deltaY;
      }
   }

   private handleMouseUp(e: MouseEvent): void {
      this._isDragging = false;
      this._pixiApp.canvas.style.cursor = "default";
   }

   private handleTouchStart(e: TouchEvent): void {
      const touch = e.touches[0];
      this._isDragging = true;
      this._dragStart = { x: touch.clientX, y: touch.clientY };
      this._stageStart = { x: this._pixiApp.stage.x, y: this._pixiApp.stage.y };
   }

   private handleTouchMove(e: TouchEvent): void {
      if (this._isDragging) {
         const touch = e.touches[0];
         const deltaX = touch.clientX - this._dragStart.x;
         const deltaY = touch.clientY - this._dragStart.y;

         this._pixiApp.stage.x = this._stageStart.x + deltaX;
         this._pixiApp.stage.y = this._stageStart.y + deltaY;
      }
   }

   private handleTouchEnd(): void {
      this._isDragging = false;
   }

   public zoomToFit(): void {
      const tracks = this._trackLayoutManager.tracks;
      if (tracks.length === 0) return;

      // Calculate bounds of all tracks
      let minX = Infinity,
         minY = Infinity,
         maxX = -Infinity,
         maxY = -Infinity;

      tracks.forEach((track) => {
         minX = Math.min(minX, track.start.x, track.end.x);
         minY = Math.min(minY, track.start.y, track.end.y);
         maxX = Math.max(maxX, track.start.x, track.end.x);
         maxY = Math.max(maxY, track.start.y, track.end.y);
      });

      // Add padding
      const padding = 50;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;

      const trackWidth = maxX - minX;
      const trackHeight = maxY - minY;
      const canvasWidth = this._pixiApp.canvas.width;
      const canvasHeight = this._pixiApp.canvas.height;

      // Calculate zoom to fit
      const zoomX = canvasWidth / trackWidth;
      const zoomY = canvasHeight / trackHeight;
      const zoom = Math.min(zoomX, zoomY, this._maxZoom);

      // Center the stage
      this._currentZoom = zoom;
      this._pixiApp.stage.scale.set(zoom);
      this._pixiApp.stage.x = (canvasWidth - trackWidth * zoom) / 2 - minX * zoom;
      this._pixiApp.stage.y = (canvasHeight - trackHeight * zoom) / 2 - minY * zoom;
   }

   private handleResize(): void {
      //this._pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
   }

   public renderTrackLayout(): void {
      // Clear previous content
      this.clear();

      const tracks = this._trackLayoutManager.tracks;
      const switches = this._trackLayoutManager.switches;

      // Render tracks
      tracks.forEach((track) => {
         this.renderTrack(track);
      });

      // Render switches
      switches.forEach((sw) => {
         this.renderSwitch(sw);
      });

      // Auto-zoom to fit on first load
      this.zoomToFit();
   }

   private renderTrack(track: Track): void {
      const graphics = new PIXI.Graphics();
      graphics
         .moveTo(track.start.x, track.start.y)
         .lineTo(track.end.x, track.end.y)
         .stroke({ width: RendererConfig.trackWidth, color: RendererConfig.trackColor, alpha: 1, cap: "round" });

      if (track.switches[0] !== null) {
         if (track.switches[0] instanceof Exit) {
            const exit = track.switches[0] as Exit;
            this.renderExit(exit, track, true);
         }
      }
      if (track.switches[1] !== null) {
         if (track.switches[1] instanceof Exit) {
            const exit = track.switches[1] as Exit;
            this.renderExit(exit, track, false);
         }
      }

      this._trackContainer.addChild(graphics);
   }

   private renderSwitch(sw: Switch): void {
      // Create a separate container for this switch
      const switchContainer = new PIXI.Container() as SwitchContainer;
      switchContainer.switchId = sw.id; // Tag the container with switch ID
      this._switchContainer.addChild(switchContainer);

      const graphics = new PIXI.Graphics();

      // Draw switch point
      graphics.circle(sw.location.x, sw.location.y, 8).fill(RendererConfig.switchColor);

      // Draw switch outline
      graphics.circle(sw.location.x, sw.location.y, 12).stroke(RendererConfig.switchColor);
      graphics.eventMode = "static";
      graphics.on("click", (event) => {
         console.log("Switch clicked at:", event.global.x, event.global.y);
         // Emit switch click event
         this._eventManager.emit("switchClicked", sw);
         this.redrawSwitch(sw);
      });
      graphics.on("pointerover", (event) => {
         this._pixiApp.canvas.style.cursor = "pointer";
      });
      graphics.on("pointerout", (event) => {
         this._pixiApp.canvas.style.cursor = "default";
      });

      switchContainer.addChild(graphics);

      // Draw track lines for each connected track
      sw.tracks.forEach((track, index) => {
         if (track) {
            const activeTrack = track === sw.branch || track === sw.from;
            const color = activeTrack ? RendererConfig.trackColor : RendererConfig.inactiveTrackColor;

            // Determine if switch is at start or end of track
            const isAtStart = track.start.equals(sw.location);
            const unitVector = isAtStart ? track.unit : track.unit.multiply(-1);

            // Draw short line from switch to inner circle
            const end = sw.location.add(unitVector.multiply(RendererConfig.switchCircleRadius));

            const lineGraphics = new PIXI.Graphics();
            lineGraphics
               .moveTo(sw.location.x, sw.location.y)
               .lineTo(end.x, end.y)
               .stroke({ width: RendererConfig.trackWidth, color: color, alpha: 1, cap: "round" });
            if (activeTrack) {
               switchContainer.addChild(lineGraphics);
            } else {
               //switchContainer.addChildAt(lineGraphics, 0);
            }
         }
      });

      // Add switch ID text
      const text = new PIXI.Text({
         text: sw.id.toString(),
         style: {
            fontSize: 12,
            fill: RendererConfig.switchTextColor,
            align: "center",
         },
      });
      text.anchor.set(0.5);
      text.x = sw.location.x;
      text.y = sw.location.y - 25;

      switchContainer.addChild(text);
   }

   public redrawSwitch(sw: Switch): void {
      // Find the container for this switch by searching through children
      let switchContainer: SwitchContainer | null = null;
      for (let i = 0; i < this._switchContainer.children.length; i++) {
         const child = this._switchContainer.children[i] as SwitchContainer;
         if (child.switchId === sw.id) {
            switchContainer = child;
            break;
         }
      }

      if (!switchContainer) {
         console.warn(`Switch container not found for switch ${sw.id}`);
         return;
      }

      // Remove the old switch container
      this._switchContainer.removeChild(switchContainer);

      // Redraw the switch
      this.renderSwitch(sw);
   }

   public renderExit(exit: Exit, track: Track, inverted: boolean): void {
      const exitContainer = new PIXI.Container() as ExitContainer;
      exitContainer.exitId = exit.id;
      const unit = track.unit.multiply(inverted ? -1 : 1);
      const position =(inverted?track.start:track.end).add(unit.multiply(5));
      const end = position.add(unit.multiply(15));
      drawArrow(exitContainer, position, end, { color: RendererConfig.trackColor, width: 2 });
      this._exitContainer.addChild(exitContainer);
   }

   public renderTrain(train: Train): void {
      if (!train.track) {
         console.warn(`Cannot render train ${train.number}: no track assigned`);
         return;
      }

      // Create a container for this train
      const trainContainer = new PIXI.Container() as TrainContainer;
      trainContainer.trainNumber = train.number;
      
      // Calculate train position on the track
      const position = this.calculateTrainPosition(train);
      
      // Calculate rotation angle based on track direction and train direction
      let trackAngle = train.track.rad; // Track angle in radians
      
      
      
      // Create rounded rectangle for train body
      const graphics = new PIXI.Graphics();
      graphics
         .roundRect(
            -RendererConfig.trainWidth / 2, 
            -RendererConfig.trainHeight / 2,
            RendererConfig.trainWidth, 
            RendererConfig.trainHeight, 
            RendererConfig.trainRadius
         )
         .fill(RendererConfig.trainColor);

      // Position and rotate the train graphics
      graphics.x = position.x;
      graphics.y = position.y;
      graphics.rotation = trackAngle;

      trainContainer.addChild(graphics);

      // Add train number text (keep horizontal for readability)
      const text = new PIXI.Text({
         text: train.number,
         style: {
            fontSize: RendererConfig.trainTextSize,
            fill: RendererConfig.trainTextColor,
            align: "center",
         },
      });
      text.anchor.set(0.5);
      text.x = position.x;
      text.y = position.y - RendererConfig.trainHeight / 2 - 15;
      // Keep text horizontal (no rotation applied)

      trainContainer.addChild(text);
      this._trainContainer.addChild(trainContainer);
   }

   public renderTrains(trains: Train[]): void {
      // Clear existing trains
      this._trainContainer.removeChildren();
      
      // Render each train
      trains.forEach(train => {
         this.renderTrain(train);
      });
   }

   public redrawTrain(train: Train): void {
      // Find and remove the existing train container
      let trainContainer: TrainContainer | null = null;
      for (let i = 0; i < this._trainContainer.children.length; i++) {
         const child = this._trainContainer.children[i] as TrainContainer;
         if (child.trainNumber === train.number) {
            trainContainer = child;
            break;
         }
      }

      if (trainContainer) {
         this._trainContainer.removeChild(trainContainer);
      }

      // Render the train again
      this.renderTrain(train);
   }

   private calculateTrainPosition(train: Train): Point {
      if (!train.track) {
         return new Point(0, 0);
      }

      return this.getPointFromPosition(train.track, train.km);
   }

   private getPointFromPosition(track: Track, km: number): Point {
      // Use the track's unit vector multiplied by km distance from the start
      const offset = track.unit.multiply(km);
      return track.start.add(offset);
   }

   public clear(): void {
      this._trackContainer.removeChildren();
      this._switchContainer.removeChildren();
      this._exitContainer.removeChildren();
      this._trainContainer.removeChildren();
   }

   public getCurrentZoom(): number {
      return this._currentZoom;
   }

   public setZoom(zoom: number): void {
      const clampedZoom = Math.max(this._minZoom, Math.min(this._maxZoom, zoom));
      this._currentZoom = clampedZoom;
      this._pixiApp.stage.scale.set(clampedZoom);
   }
}
