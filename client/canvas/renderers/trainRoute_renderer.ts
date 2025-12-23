import * as PIXI from "pixi.js";
import TrainRoute, { RoutePart } from "../../sim/trainRoute";
import Track from "../../sim/track";
import { Point } from "../../utils/point";
import { SwitchRenderer, SwitchRenderOptions } from "./switch_renderer";

export class TrainRouteRenderer {
   private _container: PIXI.Container;

   constructor(stage: PIXI.Container) {
      this._container = new PIXI.Container();
      stage.addChild(this._container);
   }

   renderAll(routes: TrainRoute[]): void {
      this.clear();
      if (!routes || routes.length === 0) return;

      const g = new PIXI.Graphics();
      const routeColor = 0x00aa00;
      const routeWidth = 3;
      // Make circle color slightly lighter than track color
      const circleColor = this.lightenColor(routeColor, 0.2);

      for (const route of routes) {
         for (const part of route.parts) {
            if (part.kind === "track") {
               const track: Track = part.track;
               const fromKm = part.fromKm ?? 0;
               const toKm = part.toKm ?? track.length;
               const p1 = this.getPointFromPosition(track, fromKm);
               const p2 = this.getPointFromPosition(track, toKm);
               g.moveTo(p1.x, p1.y);
               g.lineTo(p2.x, p2.y);
               g.stroke({ width: routeWidth, color: routeColor, alpha: 1, cap: "round" });
            } else if (part.kind === "switch") {
               const options: SwitchRenderOptions = {
                  circleColor: circleColor,
                  trackColor: routeColor,
                  trackWidth: routeWidth,
               };
               SwitchRenderer.drawSwitch(g, part.sw, options);
            }
         }
      }

      this._container.addChild(g);
   }

   clear(): void {
      this._container.removeChildren();
   }

   private getPointFromPosition(track: Track, km: number): Point {
      const offset = track.unit.multiply(km);
      return track.start.add(offset);
   }

   private lightenColor(color: number, factor: number): number {
      const r = ((color >> 16) & 0xff) + Math.round((255 - ((color >> 16) & 0xff)) * factor);
      const g = ((color >> 8) & 0xff) + Math.round((255 - ((color >> 8) & 0xff)) * factor);
      const b = (color & 0xff) + Math.round((255 - (color & 0xff)) * factor);
      return (r << 16) | (g << 8) | b;
   }
}

export default TrainRouteRenderer;


