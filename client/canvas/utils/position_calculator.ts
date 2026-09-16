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
      const connectionPoint = this.getConnectionPoint(track, nextTrack);
      const trainPosition = this.getPointFromPosition(track, km);
      if (!connectionPoint) {
         return { point: trainPosition, rotation: track.rad };
      }

      const distanceToConnection = Math.hypot(
         trainPosition.x - connectionPoint.x,
         trainPosition.y - connectionPoint.y
      );
      const transitionZone = RendererConfig.curveTransitionZone;
      if (distanceToConnection >= transitionZone) {
         return { point: trainPosition, rotation: track.rad };
      }

      // t=0 far from the joint, t=0.5 at the joint. The far side of the joint
      // samples this Bezier with swapped endpoints, so the raw tangent is
      // reversed and must be aligned back to the track heading.
      const t = 0.5 * (1 - distanceToConnection / transitionZone);
      const p0 = track.along(connectionPoint, transitionZone);
      const p1 = nextTrack.along(connectionPoint, transitionZone);
      return {
         point: Geometry.getPointOnCurve(t, p0, connectionPoint, p1),
         rotation: this.alignRotation(
            Geometry.getDegreeOfTangentOnCurve(t, p0, connectionPoint, p1),
            track.rad
         ),
      };
   }

   private static getConnectionPoint(track: Track, other: Track): Point | null {
      if (track.start.equals(other.start) || track.start.equals(other.end)) return track.start;
      if (track.end.equals(other.start) || track.end.equals(other.end)) return track.end;
      return null;
   }

   private static alignRotation(angle: number, reference: number): number {
      const delta = Math.atan2(Math.sin(angle - reference), Math.cos(angle - reference));
      return Math.abs(delta) > Math.PI / 2 ? angle + Math.PI : angle;
   }
} 