import Track from "./track";
import Switch from "./switch";

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

   constructor(start: RouteEndpoint, end: RouteEndpoint, parts: RoutePart[] = []) {
      this._start = start;
      this._end = end;
      this._parts = parts;
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

   addPart(part: RoutePart): void {
      this._parts.push(part);
   }
}

export default TrainRoute;


