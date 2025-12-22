import * as PIXI from "pixi.js";
import TrainRoute, { RoutePart } from "../../sim/trainRoute";
import Track from "../../sim/track";
import { Point } from "../../utils/point";

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
               g.stroke({ width: 3, color: 0x00aa00, alpha: 1, cap: "round" });
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
}

export default TrainRouteRenderer;


