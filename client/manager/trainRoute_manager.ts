import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import TrainRoute, { RouteEndpoint, RoutePart } from "../sim/trainRoute";
import TrackLayoutManager from "./trackLayout_manager";

export class TrainRouteManager {
   private _routes: TrainRoute[] = [];
   private _layout: TrackLayoutManager;

   constructor(layout: TrackLayoutManager) {
      this._layout = layout;
   }

   get routes(): TrainRoute[] {
      return this._routes;
   }

   /**
    * Create a TrainRoute starting at the given endpoint and store it.
    * Crawls forward along the rail network until the first signal (in direction) or an exit.
    * If the route ends at a switch, the route is invalid and null is returned.
    * direction is the direction of the train (1 for left to right, -1 for right to left).
    * @returns The created TrainRoute or null if the route is invalid.
    */
   createAndStoreRoute(start: RouteEndpoint, direction: number = 1): TrainRoute | null {
      if (!start || !start.track) throw new Error("Start endpoint must include a valid track");
      if (direction !== 1 && direction !== -1) throw new Error("Direction must be 1 or -1");

      const parts: RoutePart[] = [];

      let currentTrack: Track = start.track;
      let currentKm: number = start.km;
      let currentDirection: number = direction >= 0 ? 1 : -1;

      // Protect against malformed layouts causing infinite loops
      const maxSteps = 1000;
      let steps = 0;
      let endEndpoint: RouteEndpoint | null = null;

      const pushTrackSegment = (track: Track, fromKm: number, toKm: number) => {
         if (fromKm === toKm) return;
         parts.push({ kind: "track", track, fromKm, toKm });
      };

      const pushSwitchSegment = (sw: Switch) => {
         parts.push({ kind: "switch", sw });
      };

      while (steps++ < maxSteps) {
         // 1) Stop at the next signal on the current track (in direction), but do not search beyond this track
         const nextSignal = this._layout.getNextSignal(currentTrack, currentKm, currentDirection, true);
         if (nextSignal) {
            const endKm = nextSignal.position;
            pushTrackSegment(currentTrack, currentKm, endKm);
            endEndpoint = { track: currentTrack, km: endKm };
            break;
         }

         // 2) Move to the boundary of the current track in travel direction
         const atEnd = currentDirection > 0;
         const boundaryKm = atEnd ? currentTrack.length : 0;
         const boundaryConnection = currentTrack.switches[atEnd ? 1 : 0];
         let nextElement: Track | Switch | Exit;
         let nextDirection: number = currentDirection;
         try {
            const res = this._layout.findNextTrack(currentTrack, currentDirection);
            nextElement = res.element;
            nextDirection = res.direction;
         } catch {
            // Dead end / malformed connection
            return null;
         }

         // Include the segment up to the boundary if there is distance to cover
         pushTrackSegment(currentTrack, currentKm, boundaryKm);

         // 3) Resolve what is at the boundary
         if (nextElement instanceof Exit) {
            // Route ends at an exit
            endEndpoint = { track: currentTrack, km: boundaryKm };
            break;
         }

         if (nextElement instanceof Switch) {
            // If the route ends at a switch, it's invalid by design
            console.error("Route ended at a switch, which is invalid");
            return null;
         }

         if (nextElement instanceof Track) {
            // If crossing a switch at the boundary, include it in the route
            if (boundaryConnection instanceof Switch) {
               pushSwitchSegment(boundaryConnection);
            }
            // Advance onto the next track. Enter from its start when going forward, end when going backward.
            currentTrack = nextElement;
            currentDirection = nextDirection;
            currentKm = currentDirection > 0 ? 0 : currentTrack.length;
            continue;
         }
      }

      if (endEndpoint) {
         const route = new TrainRoute(start, endEndpoint, parts);
         this._routes.push(route);
         return route;
      }
      return null;
   }

   clearRoutes() {
      this._routes = [];
   }
}

export default TrainRouteManager;
