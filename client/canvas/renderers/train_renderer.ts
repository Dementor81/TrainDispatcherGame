import * as PIXI from "pixi.js";
import Train, { TrainStopReason } from "../../sim/train";
import Track from "../../sim/track";
import { RendererConfig } from "../../core/config";
import TrackLayoutManager from "../../manager/trackLayout_manager";
import { PositionCalculator } from "../utils/position_calculator";

interface TrainContainer extends PIXI.Container {
   trainNumber?: string;
}

export class TrainRenderer {
   private _container: PIXI.Container;
   private _trackLayoutManager: TrackLayoutManager;

   constructor(stage: PIXI.Container, trackLayoutManager: TrackLayoutManager) {
      this._container = new PIXI.Container();
      this._trackLayoutManager = trackLayoutManager;
      stage.addChild(this._container);
   }

   renderTrain(train: Train): void {
      if (!train.track) {
         console.warn(`Cannot render train ${train.number}: no track assigned`);
         return;
      }

      // Create a container for this train
      const trainContainer = new PIXI.Container() as TrainContainer;
      trainContainer.trainNumber = train.number;

      // Render each car
      for (let carIndex = 0; carIndex < train.cars; carIndex++) {
         // Calculate how far behind the locomotive this car should be

         let carTrack = train.track;
         let carKm = train.km;

         // Use followRailNetwork to find the correct position for this car
         if (carIndex !== 0) {
            const carOffsetDistance = carIndex * (RendererConfig.trainCarSpacing + RendererConfig.carWidth);
            try {
               const result = this._trackLayoutManager.followRailNetwork(
                  train.track,
                  train.km,
                  carOffsetDistance * -train.direction
               );

               if (result.element instanceof Track) {
                  carTrack = result.element;
                  carKm = result.km;
               } else {
                  continue;
               }
            } catch (error) {
               continue;
            }
         }

         let curveTrack: Track | null = null;
         // Look ahead
         try {
            const ahead = this._trackLayoutManager.followRailNetwork(carTrack, carKm, RendererConfig.curveTransitionZone);
            if (ahead.element instanceof Track && ahead.element !== carTrack) {
               curveTrack = ahead.element;
            }
         } catch {}
         // Look behind if not found ahead
         if (!curveTrack) {
            try {
               const behind = this._trackLayoutManager.followRailNetwork(carTrack, carKm, -RendererConfig.curveTransitionZone);
               if (behind.element instanceof Track && behind.element !== carTrack) {
                  curveTrack = behind.element;
               }
            } catch {}
         }

         // Calculate car's screen position
         let carPosition = PositionCalculator.getPointFromPosition(carTrack, carKm);
         let trackAngle = carTrack.rad;
         if (curveTrack && curveTrack.slope != carTrack.slope) {
            const pose = PositionCalculator.getAdvancedPose(carTrack, carKm, curveTrack);
            carPosition = pose.point;
            trackAngle = pose.rotation;
         }

         // Create rounded rectangle for car body
         const carGraphics = new PIXI.Graphics();

         // Make the first car (locomotive) slightly different
         const isLocomotive = carIndex === 0;

         let carColor: number;
         let carRadius: number;
         let carWidth: number = RendererConfig.carWidth;
         if (isLocomotive) {
            carColor = RendererConfig.locomotiveColor;
            carRadius = RendererConfig.locomotiveRadius;
         } else {
            carColor = RendererConfig.carColor;
            carRadius = RendererConfig.carRadius;
         }

         carGraphics
            .roundRect(-carWidth / 2, -RendererConfig.trainHeight / 2, carWidth, RendererConfig.trainHeight, carRadius)
            .fill(carColor);

         // Position and rotate the car graphics
         carGraphics.x = carPosition.x;
         carGraphics.y = carPosition.y;
         carGraphics.rotation = trackAngle;

         trainContainer.addChild(carGraphics);
         
         // Add train number text on the locomotive (first car at index 0)
         if (isLocomotive) {
            const text = new PIXI.Text({
               text: train.number,
               style: {
                  fontSize: RendererConfig.trainTextSize,
                  fill: RendererConfig.trainTextColor,
                  align: "center",
               },
            });
            text.anchor.set(0.5);
            text.x = carPosition.x;
            text.y = carPosition.y;
            if(trackAngle > 90 * Math.PI/180) 
               trackAngle = trackAngle - 180*Math.PI/180;

            if(trackAngle < -90 * Math.PI/180)
               trackAngle = trackAngle + 180*Math.PI/180;
            text.rotation = trackAngle;
            

            trainContainer.addChild(text);

            // Station wait pie chart overlay (no text)
            if ((train as any).stopReason === TrainStopReason.STATION) {
               const angle = carGraphics.rotation;
               const offset = RendererConfig.trainHeight / 2 + 8;
               const cx = carPosition.x + Math.cos(angle - Math.PI / 2) * offset;
               const cy = carPosition.y + Math.sin(angle - Math.PI / 2) * offset;
               const r = 5;
               const p = Math.max(0, Math.min(1, (train as any).waitingProgress ?? 0));

               const pie = new PIXI.Graphics();
               // background
               pie.circle(cx, cy, r).fill({ color: 0x000000, alpha: 0.35 });
               // progress sector starting at top
               if (p > 0) {
                  const start = -Math.PI / 2;
                  const end = start + p * Math.PI * 2;
                  pie.moveTo(cx, cy).arc(cx, cy, r, start, end).lineTo(cx, cy).fill({ color: 0xffffff, alpha: 0.9 });
               }
               // outline
               
               trainContainer.addChild(pie);
            }

            // Indicator: show red exclamation mark above the locomotive when stopped by a signal
            if (train.stoppedBySignal) {
               const indicator = new PIXI.Text({
                  text: "!",
                  style: {
                     fontSize: RendererConfig.trainTextSize + 2,
                     fill: 0xff0000,
                     align: "center",
                  },
               });
               indicator.anchor.set(0.5);

               // Position above the locomotive relative to its rotation
               const angle = carGraphics.rotation;
               const offset = RendererConfig.trainHeight / 2 + 8;
               const offsetX = carPosition.x + Math.cos(angle - Math.PI / 2) * offset;
               const offsetY = carPosition.y + Math.sin(angle - Math.PI / 2) * offset;
               indicator.x = offsetX;
               indicator.y = offsetY;
               // Keep the exclamation upright (no rotation)
               indicator.rotation = 0;

               trainContainer.addChild(indicator);
            }
         }
      }

      this._container.addChild(trainContainer);
   }

   redrawTrain(train: Train): void {
      // Find and remove the existing train container
      this.removeTrain(train.number);

      // Render the train again
      this.renderTrain(train);
   }

   removeTrain(trainNumber: string): void {
      // Find and remove the existing train container
      let trainContainer: TrainContainer | null = null;
      for (let i = 0; i < this._container.children.length; i++) {
         const child = this._container.children[i] as TrainContainer;
         if (child.trainNumber === trainNumber) {
            trainContainer = child;
            break;
         }
      }

      if (trainContainer) {
         this._container.removeChild(trainContainer);
      }
   }

   renderAll(trains: Train[]): void {
      this.clear();
      trains.forEach((train) => {
         this.renderTrain(train);
      });
   }

   clear(): void {
      this._container.removeChildren();
   }
} 