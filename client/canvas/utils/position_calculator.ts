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
      const pose = this.getAdvancedPose(track, km, nextTrack);
      return pose.point;
   }

   static getRotationFromPosition(track: Track, km: number, nextTrack: Track): number {
      const pose = this.getAdvancedPose(track, km, nextTrack);
      return pose.rotation;
   }

   static getAdvancedPose(
      track: Track,
      km: number,
      nextTrack: Track
   ): { point: Point; rotation: number } {
      // Determine the connection point between tracks
      const connectionPoint = track.start.equals(nextTrack.end) ? track.start : track.end;

      // Calculate distance from train car position to connection point
      const trainPosition = this.getPointFromPosition(track, km);
      const distanceToConnection = Math.sqrt(
         Math.pow(trainPosition.x - connectionPoint.x, 2) +
            Math.pow(trainPosition.y - connectionPoint.y, 2)
      );

      // Define the transition zone (cars within this distance will use the curve)
      const transitionZone = RendererConfig.curveTransitionZone;

      // Calculate t based on proximity to connection point
      // t = 0 when far from connection (use straight track)
      // t = 1 when at connection point (use full curve)
      let t = Math.max(0, Math.min(1, 1 - distanceToConnection / transitionZone));
      t = t / 2;

      if (distanceToConnection < transitionZone) {
         const p0 = track.along(connectionPoint, transitionZone);
         const p1 = nextTrack.along(connectionPoint, transitionZone);
         const pointOnCurve = Geometry.getPointOnCurve(t, p0, connectionPoint, p1);
         const rotationOnCurve = Geometry.getDegreeOfTangentOnCurve(t, p0, connectionPoint, p1);
         return { point: pointOnCurve, rotation: rotationOnCurve };
      }

      // Use regular straight track positioning when far from connection
      return { point: this.getPointFromPosition(track, km), rotation: track.rad };
   }
} 