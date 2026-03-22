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

   private pinchDistance(touches: TouchList): number {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
   }

   private pinchMidpoint(touches: TouchList): { x: number; y: number } {
      return {
         x: (touches[0].clientX + touches[1].clientX) / 2,
         y: (touches[0].clientY + touches[1].clientY) / 2,
      };
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
         if (e.touches.length === 2) {
            const d = this.pinchDistance(e.touches);
            const mid = this.pinchMidpoint(e.touches);
            this._camera.handlePinchStart(d, mid.x, mid.y);
         } else if (e.touches.length === 1) {
            this._camera.handleTouchStart(e);
         }
      });

      canvas.addEventListener("touchmove", (e) => {
         e.preventDefault();
         if (e.touches.length === 2) {
            const d = this.pinchDistance(e.touches);
            const mid = this.pinchMidpoint(e.touches);
            this._camera.handlePinchMove(d, mid.x, mid.y);
         } else if (e.touches.length === 1) {
            this._camera.handleTouchMove(e);
         }
      });

      canvas.addEventListener("touchend", (e) => {
         if (e.touches.length === 1) {
            this._camera.handleTouchStart(e);
         } else {
            this._camera.handleTouchEnd();
         }
      });

      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
   }
} 