import type Track from "./track";

/**
 * Stretch of a track between two consecutive boundaries (track ends and signal positions).
 * This is the unit of track occupancy, mirroring a track circuit in a real signal box.
 */
class TrackSection {
   readonly track: Track;
   readonly fromKm: number;
   readonly toKm: number;

   constructor(track: Track, fromKm: number, toKm: number) {
      this.track = track;
      this.fromKm = fromKm;
      this.toKm = toKm;
   }

   /** True if the km interval [kmA, kmB] shares a positive length with this section, or lies inside it as a point. */
   overlaps(kmA: number, kmB: number): boolean {
      const minKm = Math.min(kmA, kmB);
      const maxKm = Math.max(kmA, kmB);
      if (minKm === maxKm) return minKm >= this.fromKm && minKm <= this.toKm;
      return minKm < this.toKm && maxKm > this.fromKm;
   }
}

export default TrackSection;
