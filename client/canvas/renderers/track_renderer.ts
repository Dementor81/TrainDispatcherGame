import * as PIXI from "pixi.js";
import Track from "../../sim/track";
import Exit from "../../sim/exit";
import { RendererConfig } from "../../core/config";
import { drawArrow } from "../pixi_extension";
import TrackLayoutManager from "../../manager/trackLayout_manager";

interface ExitContainer extends PIXI.Container {
   exitId?: number;
}

interface TrackGraphics extends PIXI.Graphics {
   trackId?: number;
}

export class TrackRenderer {
   private _container: PIXI.Container;
   private _exitContainer: PIXI.Container;
   private _trackLayoutManager: TrackLayoutManager;

   constructor(stage: PIXI.Container, trackLayoutManager: TrackLayoutManager) {
      this._container = new PIXI.Container();
      this._exitContainer = new PIXI.Container();
      this._trackLayoutManager = trackLayoutManager;
      
      stage.addChild(this._container);
      stage.addChild(this._exitContainer);
   }

   renderTrack(track: Track): void {
      const graphics = new PIXI.Graphics() as TrackGraphics;
      graphics.trackId = track.id;
      graphics.eventMode = "static";
      graphics
         .moveTo(track.start.x, track.start.y)
         .lineTo(track.end.x, track.end.y)
         .stroke({ width: RendererConfig.trackWidth, color: RendererConfig.trackColor, alpha: 1, cap: "round" });

      if (track.switches[0] !== null) {
         if (track.switches[0] instanceof Exit) {
            const exit = track.switches[0] as Exit;
            this.renderExit(exit, track, true);
         }
      }
      if (track.switches[1] !== null) {
         if (track.switches[1] instanceof Exit) {
            const exit = track.switches[1] as Exit;
            this.renderExit(exit, track, false);
         }
      }

      this._container.addChild(graphics);
   }

   renderExit(exit: Exit, track: Track, inverted: boolean): void {
      const exitContainer = new PIXI.Container() as ExitContainer;
      exitContainer.exitId = exit.id;
      const unit = track.unit.multiply(inverted ? -1 : 1);
      const position = (inverted ? track.start : track.end).add(unit.multiply(5));
      const end = position.add(unit.multiply(15));
      drawArrow(exitContainer, position, end, { color: RendererConfig.trackColor, width: 2 });
      // Add destination label above the arrow tip
      const text = new PIXI.Text({
         text: exit.destination,
         style: {
            fontSize: RendererConfig.exitTextSize,
            fill: RendererConfig.exitTextColor,
            align: "center",
            fontFamily: RendererConfig.exitTextFont,
         },
      });
      text.anchor.set(0.5, 1);
      text.x = end.x;
      text.y = end.y - RendererConfig.exitTextOffset;
      exitContainer.addChild(text);
      this._exitContainer.addChild(exitContainer);
   }

   renderAll(tracks: Track[]): void {
      this.clear();
      tracks.forEach((track) => {
         this.renderTrack(track);
      });
   }

   clear(): void {
      this._container.removeChildren();
      this._exitContainer.removeChildren();
   }
} 