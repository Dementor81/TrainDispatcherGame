import * as PIXI from "pixi.js";
import Switch from "../../sim/switch";
import { RendererConfig } from "../../core/config";
import { EventManager } from "../../manager/event_manager";

interface SwitchContainer extends PIXI.Container {
   switchId?: number;
}

export class SwitchRenderer {
   private _container: PIXI.Container;
   private _eventManager: EventManager;
   private _canvas: HTMLCanvasElement;

   constructor(stage: PIXI.Container, eventManager: EventManager, canvas: HTMLCanvasElement) {
      this._container = new PIXI.Container();
      this._eventManager = eventManager;
      this._canvas = canvas;
      stage.addChild(this._container);
   }

   renderSwitch(sw: Switch): void {
      // Create a separate container for this switch
      const switchContainer = new PIXI.Container() as SwitchContainer;
      switchContainer.switchId = sw.id; // Tag the container with switch ID
      this._container.addChild(switchContainer);

      const graphics = new PIXI.Graphics();

      // Draw switch point
      graphics.circle(sw.location.x, sw.location.y, 8).fill(RendererConfig.switchColor);

      
      switchContainer.eventMode = "static";
      switchContainer.on("click", (event) => {
         console.log("Switch clicked at:", event.global.x, event.global.y);
         // Emit switch click event
         this._eventManager.emit("switchClicked", sw);
         this.redrawSwitch(sw);
      });
      switchContainer.on("pointerover", (event) => {
         this._canvas.style.cursor = "pointer";
      });
      switchContainer.on("pointerout", (event) => {
         this._canvas.style.cursor = "default";
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
      /* const text = new PIXI.Text({
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

      switchContainer.addChild(text); */
   }

   redrawSwitch(sw: Switch): void {
      // Find the container for this switch by searching through children
      let switchContainer: SwitchContainer | null = null;
      for (let i = 0; i < this._container.children.length; i++) {
         const child = this._container.children[i] as SwitchContainer;
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
      this._container.removeChild(switchContainer);

      // Redraw the switch
      this.renderSwitch(sw);
   }

   renderAll(switches: Switch[]): void {
      this.clear();
      switches.forEach((sw) => {
         this.renderSwitch(sw);
      });
   }

   clear(): void {
      this._container.removeChildren();
   }
} 