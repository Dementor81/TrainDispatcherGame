import * as PIXI from "pixi.js";
import Track from "../sim/track";

export class Camera {
   private _isDragging = false;
   private _dragStart = { x: 0, y: 0 };
   private _stageStart = { x: 0, y: 0 };
   private _currentZoom = 1;
   private _minZoom = 0.1;
   private _maxZoom = 5;
   private _stage: PIXI.Container;
   private _canvas: HTMLCanvasElement;

   constructor(stage: PIXI.Container, canvas: HTMLCanvasElement) {
      this._stage = stage;
      this._canvas = canvas;
   }

   handleZoom(e: WheelEvent): void {
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(this._minZoom, Math.min(this._maxZoom, this._currentZoom * zoomFactor));

      if (newZoom !== this._currentZoom) {
         const rect = this._canvas.getBoundingClientRect();
         const mouseX = e.clientX - rect.left;
         const mouseY = e.clientY - rect.top;

         this.zoomAtPoint(mouseX, mouseY, newZoom);
      }
   }

   private zoomAtPoint(x: number, y: number, newZoom: number): void {
      const oldZoom = this._currentZoom;
      this._currentZoom = newZoom;

      // Calculate zoom center in world coordinates
      const worldX = (x - this._stage.x) / oldZoom;
      const worldY = (y - this._stage.y) / oldZoom;

      // Update stage transform
      this._stage.scale.set(newZoom);
      this._stage.x = x - worldX * newZoom;
      this._stage.y = y - worldY * newZoom;
   }

   handleMouseDown(e: MouseEvent): void {
      if (e.button == 0) {
         this._isDragging = true;
         this._dragStart = { x: e.clientX, y: e.clientY };
         this._stageStart = { x: this._stage.x, y: this._stage.y };
         this._canvas.style.cursor = "grabbing";
      }
   }

   handleMouseMove(e: MouseEvent): void {
      if (this._isDragging) {
         const deltaX = e.clientX - this._dragStart.x;
         const deltaY = e.clientY - this._dragStart.y;

         this._stage.x = this._stageStart.x + deltaX;
         this._stage.y = this._stageStart.y + deltaY;
      }
   }

   handleMouseUp(e: MouseEvent): void {
      this._isDragging = false;
      this._canvas.style.cursor = "default";
   }

   handleTouchStart(e: TouchEvent): void {
      const touch = e.touches[0];
      this._isDragging = true;
      this._dragStart = { x: touch.clientX, y: touch.clientY };
      this._stageStart = { x: this._stage.x, y: this._stage.y };
   }

   handleTouchMove(e: TouchEvent): void {
      if (this._isDragging) {
         const touch = e.touches[0];
         const deltaX = touch.clientX - this._dragStart.x;
         const deltaY = touch.clientY - this._dragStart.y;

         this._stage.x = this._stageStart.x + deltaX;
         this._stage.y = this._stageStart.y + deltaY;
      }
   }

   handleTouchEnd(): void {
      this._isDragging = false;
   }

   zoomToFit(tracks: Track[], canvasWidth: number, canvasHeight: number): void {
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

      // Calculate zoom to fit
      const zoomX = canvasWidth / trackWidth;
      const zoomY = canvasHeight / trackHeight;
      const zoom = Math.min(zoomX, zoomY, this._maxZoom);

      // Center the stage
      this._currentZoom = zoom;
      this._stage.scale.set(zoom);
      this._stage.x = (canvasWidth - trackWidth * zoom) / 2 - minX * zoom;
      this._stage.y = (canvasHeight - trackHeight * zoom) / 2 - minY * zoom;
   }

   getCurrentZoom(): number {
      return this._currentZoom;
   }

   setZoom(zoom: number): void {
      const clampedZoom = Math.max(this._minZoom, Math.min(this._maxZoom, zoom));
      this._currentZoom = clampedZoom;
      this._stage.scale.set(clampedZoom);
   }

   get isDragging(): boolean {
      return this._isDragging;
   }
} 