import * as PIXI from "pixi.js";
import { RendererConfig } from "../../core/config";

export class MultipleUnitTrainRenderer {
   public drawCar(graphics: PIXI.Graphics, carIndex: number, carCount: number, drawingDirection: number): void {
      const isEndCar = carIndex === 0 || carIndex === carCount - 1;
      const color = isEndCar ? RendererConfig.locomotiveColor : RendererConfig.carColor;

      graphics.clear();

      if (!isEndCar) {
         graphics.rect(
            -RendererConfig.carWidth / 2,
            -RendererConfig.trainHeight / 2,
            RendererConfig.carWidth,
            RendererConfig.trainHeight
         ).fill(color);
         return;
      }

      const roundOnPositiveX = carIndex === carCount - 1
         ? drawingDirection === 1
         : drawingDirection === -1;

      this.drawSingleEndedBody(graphics, color, roundOnPositiveX);
   }

   public getLabelCarIndex(carCount: number, isReversed: boolean): number {
      if (carCount <= 1) return 0;
      const middleIndex = Math.floor(carCount / 2);
      return carCount % 2 === 1
         ? middleIndex
         : isReversed
            ? middleIndex
            : middleIndex - 1;
   }

   private drawSingleEndedBody(graphics: PIXI.Graphics, color: number, roundOnPositiveX: boolean): void {
      const halfWidth = RendererConfig.carWidth / 2;
      const halfHeight = RendererConfig.trainHeight / 2;
      const radius = halfHeight;

      if (roundOnPositiveX) {
         graphics.rect(-halfWidth, -halfHeight, RendererConfig.carWidth - radius, RendererConfig.trainHeight).fill(color);
         graphics.circle(halfWidth - radius, 0, radius).fill(color);
         return;
      }

      graphics.rect(-halfWidth + radius, -halfHeight, RendererConfig.carWidth - radius, RendererConfig.trainHeight).fill(color);
      graphics.circle(-halfWidth + radius, 0, radius).fill(color);
   }
}
