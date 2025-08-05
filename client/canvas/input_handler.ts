import { Camera } from "./camera";
import { EventManager } from "../manager/event_manager";

export class InputHandler {
   private _camera: Camera;
   private _eventManager: EventManager;

   constructor(canvas: HTMLCanvasElement, camera: Camera, eventManager: EventManager) {
      this._camera = camera;
      this._eventManager = eventManager;
      this.setupInteractivity(canvas);
   }

   private setupInteractivity(canvas: HTMLCanvasElement): void {
      // Mouse wheel zoom
      canvas.addEventListener("wheel", (e) => {
         e.preventDefault();
         this._camera.handleZoom(e);
      });

      // Mouse drag pan
      canvas.addEventListener("mousedown", (e) => {
         this._camera.handleMouseDown(e);
      });

      canvas.addEventListener("mousemove", (e) => {
         this._camera.handleMouseMove(e);
      });

      canvas.addEventListener("mouseup", (e) => {
         this._camera.handleMouseUp(e);
      });

      // Touch support for mobile
      canvas.addEventListener("touchstart", (e) => {
         e.preventDefault();
         if (e.touches.length === 1) {
            this._camera.handleTouchStart(e);
         }
      });

      canvas.addEventListener("touchmove", (e) => {
         e.preventDefault();
         if (e.touches.length === 1) {
            this._camera.handleTouchMove(e);
         }
      });

      canvas.addEventListener("touchend", () => {
         this._camera.handleTouchEnd();
      });
   }
} 