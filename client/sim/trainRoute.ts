import Track from "./track";
import Switch from "./switch";
import Signal from "./signal";
import Exit from "./exit";

export type RouteEndpoint = {
   track: Track;
   km: number;
};

export type RoutePart =
   | { kind: "track"; track: Track; fromKm?: number; toKm?: number }
   | { kind: "switch"; sw: Switch };

class TrainRoute {
   private _parts: RoutePart[];
   private _start: RouteEndpoint;
   private _end: RouteEndpoint;
   private _signal: Signal | null;
   private _exit: Exit | null;
   private _endsAtExit: boolean;

   constructor(
      start: RouteEndpoint,
      end: RouteEndpoint,
      parts: RoutePart[] = [],
      signal: Signal | null = null,
      exit: Exit | null = null,
      endsAtExit: boolean = false
   ) {
      this._start = start;
      this._end = end;
      this._parts = parts;
      this._signal = signal;
      this._exit = exit;
      this._endsAtExit = endsAtExit;
   }

   get start(): RouteEndpoint {
      return this._start;
   }

   get end(): RouteEndpoint {
      return this._end;
   }

   get parts(): RoutePart[] {
      return this._parts;
   }

   get signal(): Signal | null {
      return this._signal;
   }

   get exit(): Exit | null {
      return this._exit;
   }

   get endsAtExit(): boolean {
      return this._endsAtExit;
   }

   isEmpty(): boolean {
      return this._parts.length === 0;
   }

   containsPosition(track: Track, km: number): boolean {
      return this.partIndexContaining(track, km) >= 0;
   }

   clearParts(): void {
      this._parts = [];
   }

   reverseParts(): void {
      this._parts.reverse();
      for (const part of this._parts) {
         if (part.kind !== "track") continue;
         const fromKm = part.fromKm;
         part.fromKm = part.toKm;
         part.toKm = fromKm;
      }
   }

   releaseBehindTail(tailTrack: Track, tailKm: number): void {
      const index = this.partIndexContaining(tailTrack, tailKm);
      if (index < 0) return;

      this._parts.splice(0, index);
      this.dropLeadingSwitches();

      const first = this._parts[0];
      if (first?.kind === "track" && first.track === tailTrack && this.partFullyPassed(first, tailKm)) {
         this._parts.shift();
         this.dropLeadingSwitches();
      }

      this.dropFinalSection();
   }

   private partIndexContaining(track: Track, km: number): number {
      let found = -1;
      for (let i = 0; i < this._parts.length; i++) {
         const part = this._parts[i];
         if (part.kind !== "track" || part.track !== track) continue;
         if (!this.partCoversKm(part, km)) continue;
         found = i;
      }
      return found;
   }

   private partCoversKm(part: Extract<RoutePart, { kind: "track" }>, km: number): boolean {
      const fromKm = part.fromKm ?? 0;
      const toKm = part.toKm ?? part.track.length;
      const minKm = Math.min(fromKm, toKm);
      const maxKm = Math.max(fromKm, toKm);
      return km >= minKm && km <= maxKm;
   }

   private partFullyPassed(part: Extract<RoutePart, { kind: "track" }>, km: number): boolean {
      const fromKm = part.fromKm ?? 0;
      const toKm = part.toKm ?? part.track.length;
      if (fromKm === toKm) return true;
      if (fromKm < toKm) return km >= toKm;
      return km <= toKm;
   }

   private dropLeadingSwitches(): void {
      while (this._parts[0]?.kind === "switch") {
         this._parts.shift();
      }
   }

   /** Once the train is inside the final section, the track occupancy alone protects it and the route is released. */
   private dropFinalSection(): void {
      if (this._parts.filter(part => part.kind === "track").length <= 1) {
         this._parts = [];
      }
   }
}

export default TrainRoute;
