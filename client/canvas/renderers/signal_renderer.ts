import * as PIXI from "pixi.js";
import Signal from "../../sim/signal";
import Track from "../../sim/track";
import { RendererConfig } from "../../core/config";
import { EventManager } from "../../manager/event_manager";
import { Point } from "../../utils/point";

interface SignalContainer extends PIXI.Container {
   signalTrackId?: number;
   signalPosition?: number;
}

export class SignalRenderer {
   private _container: PIXI.Container;
   private _eventManager: EventManager;
   private _canvas: HTMLCanvasElement;

   constructor(stage: PIXI.Container, eventManager: EventManager, canvas: HTMLCanvasElement) {
      this._container = new PIXI.Container();
      this._eventManager = eventManager;
      this._canvas = canvas;
      stage.addChild(this._container);
   }

   renderSignal(signal: Signal, track: Track): void {
      // Create a container for this signal
      const signalContainer = new PIXI.Container() as SignalContainer;
      signalContainer.signalTrackId = track.id;
      signalContainer.signalPosition = signal.position;

      // Calculate signal position on track centerline
      const trackCenterPosition = this.getPointFromPosition(track, signal.position);
      
      // Calculate perpendicular offset based on signal direction
      // Direction 1 (forward): signal on right side of track
      // Direction -1 (backward): signal on left side of track
      const perpendicular = signal.direction === 1 
         ? new Point(-track.unit.y, track.unit.x)  // Right side (perpendicular clockwise)
         : new Point(track.unit.y, -track.unit.x); // Left side (perpendicular counter-clockwise)
      
      // Apply offset to position signal beside the track
      const offset = new Point(
         perpendicular.x * RendererConfig.signalTrackOffset,
         perpendicular.y * RendererConfig.signalTrackOffset
      );
      const signalPosition = trackCenterPosition.add(offset);
      
      // Create rounded rectangle background (horizontal layout)
      const background = new PIXI.Graphics();
      background
         .roundRect(-RendererConfig.signalWidth / 2, -RendererConfig.signalHeight / 2, 
                    RendererConfig.signalWidth, RendererConfig.signalHeight, RendererConfig.signalRadius)
         .fill(RendererConfig.signalBackgroundColor);

      // Add red circle (left side)
      const redCircle = new PIXI.Graphics();
      const redX = -RendererConfig.signalWidth / 2 + RendererConfig.signalCircleRadius + RendererConfig.signalCircleSpacing;
      redCircle
         .circle(redX, 0, RendererConfig.signalCircleRadius)
         .fill(signal.state ? RendererConfig.signalInactiveColor : RendererConfig.signalRedColor);

      // Add green circle (right side)  
      const greenCircle = new PIXI.Graphics();
      const greenX = RendererConfig.signalWidth / 2 - RendererConfig.signalCircleRadius - RendererConfig.signalCircleSpacing;
      greenCircle
         .circle(greenX, 0, RendererConfig.signalCircleRadius)
         .fill(signal.state ? RendererConfig.signalGreenColor : RendererConfig.signalInactiveColor);

      // Position the signal container
      signalContainer.x = signalPosition.x;
      signalContainer.y = signalPosition.y;
      
      // Make signal interactive
      signalContainer.eventMode = "static";
      signalContainer.on("click", (event) => {
         console.log("Signal clicked at:", event.global.x, event.global.y);
         // Emit signal click event with both signal and track
         this._eventManager.emit("signalClicked", signal, track);
      });
      signalContainer.on("pointerover", (event) => {
         this._canvas.style.cursor = "pointer";
      });
      signalContainer.on("pointerout", (event) => {
         this._canvas.style.cursor = "default";
      });
      
      // Add all graphics to the signal container
      signalContainer.addChild(background);
      signalContainer.addChild(redCircle);
      signalContainer.addChild(greenCircle);

      this._container.addChild(signalContainer);
   }

   redrawSignal(signal: Signal, track: Track): void {
      // Find the container for this signal by searching through children
      let signalContainer: SignalContainer | null = null;
      for (let i = 0; i < this._container.children.length; i++) {
         const child = this._container.children[i] as SignalContainer;
         if (child.signalTrackId === track.id && child.signalPosition === signal.position) {
            signalContainer = child;
            break;
         }
      }

      if (!signalContainer) {
         console.warn(`Signal container not found for signal at position ${signal.position} on track ${track.id}`);
         return;
      }

      // Remove the old signal container
      this._container.removeChild(signalContainer);

      // Redraw the signal
      this.renderSignal(signal, track);
   }

   renderAll(tracks: Track[]): void {
      this.clear();
      tracks.forEach((track) => {
         track.signals.forEach((signal) => {
            this.renderSignal(signal, track);
         });
      });
   }

   clear(): void {
      this._container.removeChildren();
   }

   private getPointFromPosition(track: Track, km: number): Point {
      // Use the track's unit vector multiplied by km distance from the start
      const offset = track.unit.multiply(km);
      return track.start.add(offset);
   }
} 