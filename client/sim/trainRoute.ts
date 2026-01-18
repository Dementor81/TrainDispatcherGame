import Track from "./track";
import Switch from "./switch";
import Signal from "./signal";
import Exit from "./exit";

export type RouteEndpoint = {
   track: Track;
   km: number; // position along the track
};

export type RoutePart =
   | { kind: "track"; track: Track; fromKm?: number; toKm?: number }
   | { kind: "switch"; sw: Switch };

class TrainRoute {
   private _parts: RoutePart[];
   private _start: RouteEndpoint;
   private _end: RouteEndpoint;
   private _signal: Signal | null; // Signal that created this route
   private _exit: Exit | null; // Exit point if route starts or ends at one

   constructor(start: RouteEndpoint, end: RouteEndpoint, parts: RoutePart[] = [], signal: Signal | null = null, exit: Exit | null = null) {
      this._start = start;
      this._end = end;
      this._parts = parts;
      this._signal = signal;
      this._exit = exit;
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

   addPart(part: RoutePart): void {
      this._parts.push(part);
   }

   /**
    * Remove a track segment from this route
    * @param track - The track to remove
    * @returns true if the track was found and removed, false otherwise
    */
   removeTrack(track: Track): boolean {
      const initialLength = this._parts.length;
      this._parts = this._parts.filter(part => {
         if (part.kind === "track" && part.track === track) {
            return false; // Remove this part
         }
         return true; // Keep this part
      });
      return this._parts.length < initialLength;
   }

   /**
    * Remove the first part if it is a switch
    * @returns true if a switch was removed, false otherwise
    */
   removeFirstSwitchIfPresent(): boolean {
      if (this._parts.length > 0 && this._parts[0].kind === "switch") {
         this._parts.shift();
         return true;
      }
      return false;
   }

   /**
    * Check if the route has any parts remaining
    * @returns true if route has no parts, false otherwise
    */
   isEmpty(): boolean {
      return this._parts.length === 0;
   }
}

export default TrainRoute;


