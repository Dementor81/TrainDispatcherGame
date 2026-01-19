import * as PIXI from "pixi.js";
import Train, { TrainStopReason } from "../../sim/train";
import Track from "../../sim/track";
import { RendererConfig } from "../../core/config";
import TrackLayoutManager from "../../manager/trackLayout_manager";
import { EventManager } from "../../manager/event_manager";
import { PositionCalculator } from "../utils/position_calculator";
import TrainManager from "../../manager/train_manager";

interface TrainContainer extends PIXI.Container {
   trainNumber?: string;
   cars?: PIXI.Graphics[];
   numberText?: PIXI.Text;
   stationPie?: PIXI.Graphics;
   signalWarning?: PIXI.Graphics;
}

export class TrainRenderer {
   private _container: PIXI.Container;
   private _trackLayoutManager: TrackLayoutManager;
   private _trainManager: TrainManager;
   private _eventManager: EventManager;
   private _canvas: HTMLCanvasElement;
   private _trainContainersByNumber: Map<string, TrainContainer> = new Map();

   constructor(stage: PIXI.Container, trackLayoutManager: TrackLayoutManager, eventManager: EventManager, canvas: HTMLCanvasElement, trainManager: TrainManager) {
      this._container = new PIXI.Container();
      this._trackLayoutManager = trackLayoutManager;
      this._eventManager = eventManager;
      this._canvas = canvas;
      this._trainManager = trainManager;
      stage.addChild(this._container);
   }

   /**
    * Render a single train, checks if the train is still in the train manager and if not, removes the graphics and returns
    */
   renderTrain(train: Train): void {
      const trains = this._trainManager.getAllTrains();

      if (!trains.includes(train)) {
         // Train is no longer present; remove its graphics if needed and return
         const existingContainer = this._trainContainersByNumber.get(train.number);
         if (existingContainer) {
            this._container.removeChild(existingContainer);
            this._trainContainersByNumber.delete(train.number);
         }
         return;
      }

      if (!train.position) {
         console.warn(`Cannot render train ${train.number}: no track assigned`);
         return;
      }

      const trainContainer = this.getOrCreateTrainContainer(train);
      this.updateTrainGraphics(train, trainContainer);
   }
 
   /**
    * Render all trains by removing all existing containers and rendering all trains
    */
   renderAll(): void {
      this.clear();
      const trains = this._trainManager.getAllTrains();
      for (const train of trains) {
         this.renderTrain(train);
      }
   }

   clear(): void {
      this._trainContainersByNumber.clear();
      this._container.removeChildren();
   }

   private getOrCreateTrainContainer(train: Train): TrainContainer {
      const existing = this._trainContainersByNumber.get(train.number);
      if (existing) return existing;

      const trainContainer = new PIXI.Container() as TrainContainer;
      trainContainer.trainNumber = train.number;
      trainContainer.eventMode = "dynamic";
      trainContainer.interactiveChildren = true;

      trainContainer.cars = [];

      // Create locomotive number label once
      const text = new PIXI.Text({
         text: train.number,
         style: {
            fontSize: RendererConfig.trainTextSize,
            fill: RendererConfig.trainTextColor,
            align: "center",
         },
      });
      text.eventMode = "none";
      text.anchor.set(0.5);
      trainContainer.numberText = text;
      trainContainer.addChild(text);

      // Create station wait pie once; we redraw/position it during updates.
      const pie = new PIXI.Graphics();
      trainContainer.stationPie = pie;
      trainContainer.addChild(pie);

      // Create signal warning indicator (exclamation mark)
      const warning = new PIXI.Graphics();
      trainContainer.signalWarning = warning;
      trainContainer.addChild(warning);

      this._trainContainersByNumber.set(train.number, trainContainer);
      this._container.addChild(trainContainer);
      return trainContainer;
   }

   private ensureCarGraphics(train: Train, trainContainer: TrainContainer): void {
      const cars = (trainContainer.cars ??= []);

      // Remove extra cars
      while (cars.length > train.cars) {
         const g = cars.pop();
         if (!g) break;
         trainContainer.removeChild(g);
         g.destroy();
      }

      // Add missing cars
      while (cars.length < train.cars) {
         const carIndex = cars.length;
         const isLocomotive = carIndex === 0;

         const g = new PIXI.Graphics();
         const carWidth: number = RendererConfig.carWidth;
         const carColor = isLocomotive ? RendererConfig.locomotiveColor : RendererConfig.carColor;
         const carRadius = isLocomotive ? RendererConfig.locomotiveRadius : RendererConfig.carRadius;

         g.roundRect(-carWidth / 2, -RendererConfig.trainHeight / 2, carWidth, RendererConfig.trainHeight, carRadius).fill(carColor);

         g.eventMode = "dynamic";
         g.on("pointerup", () => {
            this._eventManager.emit("trainClicked", train.number);
         });
         g.on("pointerover", () => {
            this._canvas.style.cursor = "pointer";
         });
         g.on("pointerout", () => {
            this._canvas.style.cursor = "default";
         });

         cars.push(g);
         trainContainer.addChild(g);
      }
   }

   private updateTrainGraphics(train: Train, trainContainer: TrainContainer): void {
      if (!train.position) return;

      this.ensureCarGraphics(train, trainContainer);
      const cars = trainContainer.cars ?? [];

      for (let carIndex = 0; carIndex < cars.length; carIndex++) {
         // Calculate how far behind the locomotive this car should be
         let carTrack = train.position.track;
         let carKm = train.position.km;

         // Use followRailNetwork to find the correct position for this car
         if (carIndex !== 0) {
            const carOffsetDistance = carIndex * (RendererConfig.trainCarSpacing + RendererConfig.carWidth);
            try {
               const result = this._trackLayoutManager.followRailNetwork(
                  train.position.track,
                  train.position.km,
                  carOffsetDistance * -train.direction
               );

               if (result.element instanceof Track) {
                  carTrack = result.element;
                  carKm = result.km;
               } else {
                  continue;
               }
            } catch {
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

         // Position and rotate the car graphics
         const carGraphics = cars[carIndex];
         carGraphics.x = carPosition.x;
         carGraphics.y = carPosition.y;
         carGraphics.rotation = trackAngle;

         // Locomotive-only overlays
         if (carIndex === 0) {
            const text = trainContainer.numberText;
            if (text) {
               text.text = train.number;
               text.x = carPosition.x;
               text.y = carPosition.y;

               // prevent text from being upside down by rotating it to the correct angle
               let textAngle = trackAngle;
               if (textAngle > Math.PI / 2) textAngle -= Math.PI;
               if (textAngle < -Math.PI / 2) textAngle += Math.PI;
               text.rotation = textAngle;

               // Ensure overlays stay on top of cars
               trainContainer.addChild(text);
            }

            const pie = trainContainer.stationPie;
            if (pie) {
               const isWaiting = train.stopReason === TrainStopReason.STATION;
               pie.visible = isWaiting;

               if (isWaiting) {
                  const angle = carGraphics.rotation;
                  const offset = RendererConfig.trainHeight / 2 + 8;
                  const cx = carPosition.x + Math.cos(angle - Math.PI / 2) * offset;
                  const cy = carPosition.y + Math.sin(angle - Math.PI / 2) * offset;
                  const r = 5;
                  const p = Math.max(0, Math.min(1, train.waitingProgress ?? 0));

                  pie.clear();
                  // Background circle
                  pie.circle(cx, cy, r);
                  pie.fill({ color: 0x000000, alpha: 0.35 });
                  // Progress pie
                  if (p > 0) {
                     const start = -Math.PI / 2;
                     const end = start + p * Math.PI * 2;
                     pie.moveTo(cx, cy);
                     pie.arc(cx, cy, r, start, end);
                     pie.lineTo(cx, cy);
                     pie.fill({ color: 0xffffff, alpha: 0.9 });
                  }
               } else {
                  pie.clear();
               }

               // Ensure overlays stay on top of cars
               trainContainer.addChild(pie);
            }

            // Render signal warning (exclamation mark) when stopped by signal
            const warning = trainContainer.signalWarning;
            if (warning) {
               const isWaitingAtSignal = train.stopReason === TrainStopReason.SIGNAL;
               warning.visible = isWaitingAtSignal;

               if (isWaitingAtSignal) {
                  const angle = carGraphics.rotation;
                  const offset = RendererConfig.trainHeight / 2 + 8;
                  const cx = carPosition.x + Math.cos(angle - Math.PI / 2) * offset;
                  const cy = carPosition.y + Math.sin(angle - Math.PI / 2) * offset;
                  const size = 10;

                  warning.clear();
                  // Draw red circle background
                  warning.circle(cx, cy, size);
                  warning.fill({ color: 0xff0000, alpha: 0.9 });
                  // Draw white exclamation mark
                  warning.rect(cx - 1, cy - 6, 2, 8);
                  warning.fill({ color: 0xffffff });
                  warning.circle(cx, cy + 5, 1.5);
                  warning.fill({ color: 0xffffff });
               } else {
                  warning.clear();
               }

               // Ensure overlays stay on top of cars
               trainContainer.addChild(warning);
            }
         }
      }
   }
} 