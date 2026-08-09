import * as PIXI from "pixi.js";
import Track from "../../sim/track";
import Exit from "../../sim/exit";
import { RendererConfig } from "../../core/config";
import { drawArrow } from "../pixi_extension";
import TrackLayoutManager from "../../manager/trackLayout_manager";
import { Point } from "../../utils/point";
import { V2 } from "../../utils/v2";

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

      if (track.switches[0] === null) {
         this.renderBumper(graphics, track, track.start);
      } else if (track.switches[0] instanceof Exit) {
         this.renderExit(track.switches[0] as Exit, track, true);
      }

      if (track.switches[1] === null) {
         this.renderBumper(graphics, track, track.end);
      } else if (track.switches[1] instanceof Exit) {
         this.renderExit(track.switches[1] as Exit, track, false);
      }

      this._container.addChild(graphics);
   }

   private renderBumper(graphics: PIXI.Graphics, track: Track, point: Point): void {
      const half = RendererConfig.bumperLength / 2;
      const normal = new V2(-track.unit.y, track.unit.x).multiply(half);
      graphics
         .moveTo(point.x - normal.x, point.y - normal.y)
         .lineTo(point.x + normal.x, point.y + normal.y)
         .stroke({ width: RendererConfig.trackWidth, color: RendererConfig.trackColor, alpha: 1, cap: "butt" });
   }

   renderExit(exit: Exit, track: Track, inverted: boolean): void {
      const exitContainer = new PIXI.Container() as ExitContainer;
      exitContainer.exitId = exit.id;
      
      // Position is determined by inverted (which end of track)
      const unit = track.unit.multiply(inverted ? -1 : 1);
      const basePosition = inverted ? track.start : track.end;
      
      // Arrow direction: flip for inbound exits, normal for outbound
      // For inbound, offset by total arrow length (5 + 15 = 20) so it doesn't overlap when flipped
      const arrowOffset = exit.isInbound ? 20 : 5;
      const arrowLength = exit.isInbound ? -15 : 15;
      
      const position = basePosition.add(unit.multiply(arrowOffset));
      const end = position.add(unit.multiply(arrowLength));
      
      drawArrow(exitContainer, position, end, { color: RendererConfig.trackColor, width: 2 });
      
      // Get destination from connection
      // If inbound, show where trains come from; if outbound, show where they go to
      const destinationText = exit.connection 
         ? (exit.isInbound ? exit.connection.from : exit.connection.to)
         : '';
      
      // Add destination label above the arrow tip
      const text = new PIXI.Text({
         text: destinationText,
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