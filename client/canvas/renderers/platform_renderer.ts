import * as PIXI from "pixi.js";
import TrackLayoutManager from "../../manager/trackLayout_manager";
import { RendererConfig } from "../../core/config";
import { PlatformDto } from "../../network/dto";
import { V2 } from "../../utils/v2";
import { Point } from "../../utils/point";
import Track from "../../sim/track";

export class PlatformRenderer {
   private _container: PIXI.Container;
   private _trackLayoutManager: TrackLayoutManager;

   constructor(stage: PIXI.Container, trackLayoutManager: TrackLayoutManager) {
      this._container = new PIXI.Container();
      this._trackLayoutManager = trackLayoutManager;
      stage.addChild(this._container);
   }

   renderAll(platforms: PlatformDto[]): void {
      this.clear();
      for (const p of platforms) {
         this.renderPlatform(p);
      }
   }

   clear(): void {
      this._container.removeChildren();
   }

   private renderPlatform(platform: PlatformDto): void {
      const track = this._trackLayoutManager.tracks.find((t) => t.id === platform.track);
      if (!track) return;

      const fromKm = this.clampKm(platform.from_km, track);
      const toKm = this.clampKm(platform.to_km, track);
      if (fromKm === toKm) return;

      // Determine side of track:
      // - decreasing km (from > to) => "above"
      // - increasing km (from < to) => "below"
      const isDecreasing = platform.from_km > platform.to_km;
      const sideSign = isDecreasing ? -1 : 1;

      // Normal points to the "left" side of the track when looking from start -> end.
      const normal = new V2(-track.unit.y, track.unit.x);
      const offset = normal.multiply(sideSign * RendererConfig.platformOffset);
      const thickness = normal.multiply(sideSign * RendererConfig.platformThickness);

      const a = this.pointAlongTrack(track, fromKm).add(offset);
      const b = this.pointAlongTrack(track, toKm).add(offset);
      const c = b.add(thickness);
      const d = a.add(thickness);

      const graphics = new PIXI.Graphics();
      graphics
         .moveTo(a.x, a.y)
         .lineTo(b.x, b.y)
         .lineTo(c.x, c.y)
         .lineTo(d.x, d.y)
         .closePath()
         .fill({ color: RendererConfig.platformColor, alpha: RendererConfig.platformAlpha });

      this._container.addChild(graphics);
   }

   private pointAlongTrack(track: Track, km: number): Point {
      // In this project "km" means "distance along track" (pixel distance), starting at track.start.
      return track.start.add(track.unit.multiply(km));
   }

   private clampKm(km: number, track: Track): number {
      if (!Number.isFinite(km)) return 0;
      if (km < 0) return 0;
      if (km > track.length) return track.length;
      return km;
   }
}


