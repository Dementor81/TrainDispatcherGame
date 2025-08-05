import Track from "../../sim/track";
import { Point } from "../../utils/point";
import { Geometry } from "../../utils/geometry";
import { RendererConfig } from "../../core/config";

export class PositionCalculator {
   static getPointFromPosition(track: Track, km: number): Point {
      // Use the track's unit vector multiplied by km distance from the start
      const offset = track.unit.multiply(km);
      return track.start.add(offset);
   }

   static getPointFromPositionAdvanced(track: Track, km: number, nextTrack: Track): Point {
      // Determine the connection point between tracks
      const cp = track.start.equals(nextTrack.end) ? track.start : track.end;

      // Calculate distance from train car position to connection point
      const trainPosition = this.getPointFromPosition(track, km);
      const distanceToConnection = Math.sqrt(Math.pow(trainPosition.x - cp.x, 2) + Math.pow(trainPosition.y - cp.y, 2));

      // Define the transition zone (cars within this distance will use the curve)
      const transitionZone = RendererConfig.curveTransitionZone; // Same as the curve control point distance

      // Calculate t based on proximity to connection point
      // t = 0 when far from connection (use straight track)
      // t = 1 when at connection point (use full curve)
      let t = Math.max(0, Math.min(1, 1 - distanceToConnection / transitionZone));
      t = t / 2;

      // If we're very close to the connection, use the curve
      if (distanceToConnection < transitionZone) {
         const p0 = track.along(cp, transitionZone);
         const p1 = nextTrack.along(cp, transitionZone);
         return Geometry.getPointOnCurve(t, p0, cp, p1);
      } else {
         // Use regular straight track positioning when far from connection
         return this.getPointFromPosition(track, km);
      }
   }

   static getRotationFromPosition(track: Track, km: number, nextTrack: Track): number {
      // Determine the connection point between tracks
      const cp = track.start.equals(nextTrack.end) ? track.start : track.end;

      // Calculate distance from train car position to connection point
      const trainPosition = this.getPointFromPosition(track, km);
      const distanceToConnection = Math.sqrt(Math.pow(trainPosition.x - cp.x, 2) + Math.pow(trainPosition.y - cp.y, 2));

      // Define the transition zone (cars within this distance will use the curve)
      const transitionZone = RendererConfig.curveTransitionZone; // Same as the curve control point distance

      // Calculate t based on proximity to connection point
      // t = 0 when far from connection (use straight track)
      // t = 1 when at connection point (use full curve)
      let t = Math.max(0, Math.min(1, 1 - distanceToConnection / transitionZone));
      t = t / 2;

      // If we're very close to the connection, use the curve
      if (distanceToConnection < transitionZone) {
         const p0 = track.along(cp, transitionZone);
         const p1 = nextTrack.along(cp, transitionZone);
         const rad = Geometry.getDegreeOfTangentOnCurve(t, p0, cp, p1);
         console.log(`rotation: ${rad*180/Math.PI} t: ${t}`);
         return rad;
      } else {
         // Use regular straight track positioning when far from connection
         return track.rad;
      }
   }
} 