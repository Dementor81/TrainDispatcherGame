import Train from "../sim/train";
import Switch from "../sim/switch";
import { TrackLayoutManager } from "./trackLayout_manager";
import { SimulationConfig } from "../core/config";
import Application from "@core/application";
import { ClientSimulation } from "@core/clientSimulation";

export class TrainMovementHandler {
   private _trackLayoutManager: TrackLayoutManager;
   private _clientSimulation: ClientSimulation;

   constructor(application: Application) {
      this._trackLayoutManager = application.trackLayoutManager;
      this._clientSimulation = application.clientSimulation;
   }

   /** Signed distance traveled this tick. Braking uses constant deceleration and stops at distanceToStop. */
   updateTrainSpeed(train: Train): number {
      const aimedSpeed = Math.max(0, Math.min(train.speedAimed, train.maxAllowedSpeed));
      const dtSeconds = SimulationConfig.simulationIntervalSeconds * this._clientSimulation.speed;
      const direction = train.movingDirection;
      const speed = train.speedCurrent;

      if (speed < aimedSpeed) {
         const accelerationStep = SimulationConfig.trainAcceleration * dtSeconds;
         train.speedCurrent = Math.min(aimedSpeed, speed + accelerationStep);
         return train.speedCurrent * dtSeconds * direction;
      }

      if (speed > aimedSpeed) {
         const step = this.brakingStep(speed, aimedSpeed, train.distanceToStop, dtSeconds);
         train.speedCurrent = step.speed;
         return step.travel * direction;
      }

      return speed * dtSeconds * direction;
   }

   private brakingStep(
      speed: number,
      aimed: number,
      remaining: number | null,
      dt: number
   ): { speed: number; travel: number } {
      if (speed <= 0.05 || (remaining !== null && remaining <= 0)) return { speed: 0, travel: 0 };

      const decel = remaining === null ? 10 : (speed * speed) / (2 * remaining);
      if (!Number.isFinite(decel) || decel <= 0) return { speed: 0, travel: Math.max(0, remaining ?? 0) };
      const timeToAimed = (speed - aimed) / decel;
      const arrived = dt >= timeToAimed;
      const step = Math.min(dt, timeToAimed);
      let travel = speed * step - 0.5 * decel * step * step;
      if (remaining !== null) travel = Math.min(Math.max(0, travel), remaining);
      let nextSpeed = arrived ? aimed : Math.max(0, speed - decel * dt);
      if (nextSpeed <= 0.05 && (arrived || remaining === null)) nextSpeed = 0;
      return { speed: nextSpeed, travel };
   }

   /** Places the tail `trainLength` behind the head. Returns false when the tail ends up on a blocking switch (derailed). */
   updateTailPosition(train: Train, trainLength: number = train.length): boolean {
      const head = train.position;
      if (!head) throw new Error(`Train ${train.number} has no position`);
      if (trainLength <= 0) {
         train.setTailPosition(head.track, head.km);
         return true;
      }

      const tail = this._trackLayoutManager.walk(head.track, head.km, -trainLength * train.movingDirection);
      if (tail.element instanceof Switch) return false;
      train.setTailPosition(tail.track, tail.km);
      return true;
   }

   /** Pulls the tail toward the exit boundary. Returns true once the whole train has left the layout. */
   updateExitingTrain(train: Train): boolean {
      if (!train.position || train.exitBoundaryKm === null) return false;

      const movedDistance = Math.abs(train.getMovementDistance());
      if (movedDistance <= 0.001) return false;

      train.advanceExitProgress(movedDistance);
      const remainingLength = Math.max(0, train.length - train.exitProgressMeters);
      train.setPosition(train.position.track, train.exitBoundaryKm);
      this.updateTailPosition(train, remainingLength);
      return remainingLength <= 0;
   }
}

export default TrainMovementHandler;
