import * as PIXI from "pixi.js";
import Track from "../../sim/track";
import { RendererConfig } from "../../core/config";
import TrackLayoutManager from "../../manager/trackLayout_manager";

export class StationRenderer {
   private _container: PIXI.Container;
   private _trackLayoutManager: TrackLayoutManager;

   constructor(stage: PIXI.Container, trackLayoutManager: TrackLayoutManager) {
      this._container = new PIXI.Container();
      this._trackLayoutManager = trackLayoutManager;
      stage.addChild(this._container);
   }

   renderStationName(): void {
      const stationName = this._trackLayoutManager.layoutTitle;
      if (!stationName) return;

      // Calculate the center position of the layout
      const tracks = this._trackLayoutManager.tracks;
      if (tracks.length === 0) return;

      // Calculate bounds of all tracks
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      tracks.forEach((track) => {
         minX = Math.min(minX, track.start.x, track.end.x);
         minY = Math.min(minY, track.start.y, track.end.y);
         maxX = Math.max(maxX, track.start.x, track.end.x);
         maxY = Math.max(maxY, track.start.y, track.end.y);
      });

      // Calculate center position
      const centerX = (minX + maxX) / 2;
      const centerY = minY - RendererConfig.stationTextOffset;

      // Create station name text
      const text = new PIXI.Text({
         text: stationName,
         style: {
            fontSize: RendererConfig.stationTextSize,
            fill: RendererConfig.stationTextColor,
            align: "center",
            fontFamily: RendererConfig.stationTextFont,
         },
      });
      text.anchor.set(0.5);
      text.x = centerX;
      text.y = centerY;

      // Add to the container
      this._container.addChild(text);
   }

   clear(): void {
      this._container.removeChildren();
   }
} 