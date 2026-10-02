import * as PIXI from "pixi.js";
import TrainRoute from "../../sim/trainRoute";
import Track from "../../sim/track";
import Switch from "../../sim/switch";
import Exit from "../../sim/exit";
import TrackSection from "../../sim/trackSection";
import { Point } from "../../utils/point";
import { RendererConfig } from "../../core/config";
import { SwitchRenderer } from "./switch_renderer";
import { TrackRenderer } from "./track_renderer";
import { OccupiedElement } from "../../manager/trackOccupancyStore";
import TrackLayoutManager from "../../manager/trackLayout_manager";

/** Draws the interlocking state on top of the layout: set routes in green, occupied elements in red. */
export class TrainRouteRenderer {
   private _container: PIXI.Container;
   private _trackLayoutManager: TrackLayoutManager;

   constructor(stage: PIXI.Container, trackLayoutManager: TrackLayoutManager) {
      this._container = new PIXI.Container();
      this._trackLayoutManager = trackLayoutManager;
      stage.addChild(this._container);
   }

   renderAll(routes: TrainRoute[], occupied: Iterable<OccupiedElement>): void {
      this.clear();
      const g = new PIXI.Graphics();

      for (const route of routes) {
         for (const part of route.parts) {
            if (part.kind === "track") this.drawSegment(g, part.track, part.fromKm ?? 0, part.toKm ?? part.track.length, RendererConfig.routeColor);
            else this.drawSwitch(g, part.sw, RendererConfig.routeColor);
         }
      }

      for (const element of occupied) {
         if (element instanceof TrackSection) this.drawSegment(g, element.track, element.fromKm, element.toKm, RendererConfig.occupiedColor);
         else if (element instanceof Switch) this.drawSwitch(g, element, RendererConfig.occupiedColor);
         else if (element instanceof Exit) this.drawExit(element);
      }

      this._container.addChild(g);
   }

   clear(): void {
      this._container.removeChildren();
   }

   private drawSegment(g: PIXI.Graphics, track: Track, fromKm: number, toKm: number, color: number): void {
      const radius = RendererConfig.switchCircleRadius;
      if (track.switchAtStart()) {
         if (fromKm === 0) fromKm = radius;
         else if (toKm === 0) toKm = radius;
      }
      if (track.switchAtEnd()) {
         if (toKm === track.length) toKm = Math.max(toKm - radius, 0);
         else if (fromKm === track.length) fromKm = Math.max(fromKm - radius, 0);
      }
      if (fromKm === toKm) return;

      const p1 = this.getPointFromPosition(track, fromKm);
      const p2 = this.getPointFromPosition(track, toKm);
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.stroke({ width: RendererConfig.stateOverlayWidth, color, alpha: 1, cap: "round" });
   }

   private drawSwitch(g: PIXI.Graphics, sw: Switch, color: number): void {
      SwitchRenderer.drawSwitch(g, sw, {
         circleColor: this.lightenColor(color, 0.2),
         trackColor: color,
         trackWidth: RendererConfig.stateOverlayWidth,
      });
   }

   private drawExit(exit: Exit): void {
      const { track, km } = this._trackLayoutManager.getExitPointLocation(exit.id);
      if (!track) return;
      TrackRenderer.drawExitArrow(this._container, exit, track, km === 0, RendererConfig.occupiedColor);
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
