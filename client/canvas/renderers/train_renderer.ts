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
   frontDot?: PIXI.Graphics;
   tailDot?: PIXI.Graphics;
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

      // Listen for train transformation events
      this._eventManager.on('trainTransformed', (train: Train, oldNumber: string, newNumber: string) => {
         this.handleTrainTransformed(oldNumber, newNumber);
      });
   }

   /**
    * Handle train number transformation by updating the container map and display
    */
   private handleTrainTransformed(oldNumber: string, newNumber: string): void {
      const existingContainer = this._trainContainersByNumber.get(oldNumber);
      if (existingContainer) {
         // Remove old mapping
         this._trainContainersByNumber.delete(oldNumber);

         // Update container properties
         existingContainer.trainNumber = newNumber;
         if (existingContainer.numberText) {
            existingContainer.numberText.text = newNumber;
         }

         // Add new mapping
         this._trainContainersByNumber.set(newNumber, existingContainer);

         console.log(`TrainRenderer: Updated train container from ${oldNumber} to ${newNumber}`);
      }
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

      // Add missing cars - create simple graphics, styling will be applied in updateTrainGraphics
      while (cars.length < train.cars) {
         const g = new PIXI.Graphics();
         g.eventMode = "dynamic";
         g.on("pointerup", () => {
            this._eventManager.emit("trainClicked", train.number);
            console.log(train);
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

      let carIndex = 0;
      let carTrack = train.position.track;
      let carKm = train.position.km;

      let drawingDirection = train.drawingDirection;
      let isReversed = train.movingDirection === train.drawingDirection;

      for (carIndex = 0; carIndex < cars.length; carIndex++) {
         const isLocomotive = carIndex === 0;
         // move each car, so instead of the center of the first car, the head of the first car is at the position of the train
         let carOffset = RendererConfig.carWidth / 2 * drawingDirection * (isReversed ? -1 : 1);

         if (carIndex !== 0 && !isReversed || carIndex !== cars.length - 1 && isReversed) {
            const carPositionInTrain = isReversed ? -(cars.length - carIndex - 1) : carIndex;
            carOffset += carPositionInTrain * (RendererConfig.trainCarSpacing + RendererConfig.carWidth) * drawingDirection;
         }
         try {
            const result = this._trackLayoutManager.followRailNetwork(
               train.position.track,
               train.position.km,
               carOffset
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
         const carGraphics = cars[carIndex];
         const carColor = isLocomotive ? RendererConfig.locomotiveColor : RendererConfig.carColor;
         const carRadius = isLocomotive ? RendererConfig.locomotiveRadius : RendererConfig.carRadius;

         carGraphics.clear();
         carGraphics.roundRect(-RendererConfig.carWidth / 2, -RendererConfig.trainHeight / 2, RendererConfig.carWidth, RendererConfig.trainHeight, carRadius).fill(carColor);
         //carGraphics.circle(0, 0, 2).fill(carColor);

         let curveTrack: Track | null = null;
         // Look ahead
         try {
            const ahead = this._trackLayoutManager.followRailNetwork(carTrack, carKm, RendererConfig.curveTransitionZone);
            if (ahead.element instanceof Track && ahead.element !== carTrack) {
               curveTrack = ahead.element;
            }
         } catch { }
         // Look behind if not found ahead
         if (!curveTrack) {
            try {
               const behind = this._trackLayoutManager.followRailNetwork(carTrack, carKm, -RendererConfig.curveTransitionZone);
               if (behind.element instanceof Track && behind.element !== carTrack) {
                  curveTrack = behind.element;
               }
            } catch { }
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
         carGraphics.x = carPosition.x;
         carGraphics.y = carPosition.y;
         carGraphics.rotation = trackAngle;

         // Locomotive-only overlays
         if (isLocomotive) {
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
         // Remove any existing graphics for front and tail dots before drawing new ones
         if (trainContainer.frontDot) {
            trainContainer.removeChild(trainContainer.frontDot);
         }
         if (trainContainer.tailDot) {
            trainContainer.removeChild(trainContainer.tailDot);
         }

         // Draw a point at the front (train position)
         if (train.position) {
            const frontScreen = PositionCalculator.getPointFromPosition(train.position.track, train.position.km);
            const frontDot = new PIXI.Graphics();
            frontDot.circle(frontScreen.x, frontScreen.y, 4);
            frontDot.fill({ color: 0x00ff00, alpha: 1 });
            trainContainer.addChild(frontDot);
            trainContainer.frontDot = frontDot;
         }

         // Draw a point at the tail position
         if (train.tailPosition) {
            const tailScreen = PositionCalculator.getPointFromPosition(train.tailPosition.track, train.tailPosition.km);
            const tailDot = new PIXI.Graphics();
            tailDot.circle(tailScreen.x, tailScreen.y, 4);
            tailDot.fill({ color: 0xff00ff, alpha: 1 });
            trainContainer.addChild(tailDot);
            trainContainer.tailDot = tailDot;
         }
      }
   }
} 