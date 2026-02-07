import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import Signal from "../sim/signal";
import TrainRoute, { RouteEndpoint, RoutePart } from "../sim/trainRoute";
import TrackLayoutManager from "./trackLayout_manager";
import { EventManager } from "./event_manager";

export class TrainRouteManager {
   private _routes: TrainRoute[] = [];
   private _layout: TrackLayoutManager;
   private _eventManager: EventManager;

   constructor(layout: TrackLayoutManager, eventManager: EventManager) {
      this._layout = layout;
      this._eventManager = eventManager;
      this.subscribeToLocalEvents();
   }
   subscribeToLocalEvents() {
      this._eventManager.on("simulationStopped", () => {
         this.clearRoutes();
      });
      this._eventManager.on("trainTailPassed", ( passed: { track?: Track | null; km?: number }) => {
         this.handleTrainTailPassed(passed);
      });
   }

   get routes(): TrainRoute[] {
      return this._routes;
   }

   /**
    * Check if a track segment overlaps with any existing route
    * Routes that touch at endpoints (e.g., 0-60 and 60-100) are allowed
    * @param track - The track to check
    * @param fromKm - Start kilometer of the segment
    * @param toKm - End kilometer of the segment
    * @returns true if the track segment overlaps with any existing route, false otherwise
    */
   private isTrackSegmentOverlapping(track: Track, fromKm: number, toKm: number): boolean {
      // Normalize the range (fromKm might be greater than toKm)
      const minKm = Math.min(fromKm, toKm);
      const maxKm = Math.max(fromKm, toKm);

      for (const route of this._routes) {
         for (const part of route.parts) {
            if (part.kind === "track" && part.track === track) {
               // Check if the kilometer ranges overlap
               const partFromKm = part.fromKm ?? 0;
               const partToKm = part.toKm ?? track.length;
               const partMinKm = Math.min(partFromKm, partToKm);
               const partMaxKm = Math.max(partFromKm, partToKm);

               // Check for overlap: ranges overlap if they share interior points
               // Touching at endpoints is allowed (e.g., [0,60] and [60,100] are allowed)
               // Overlap occurs when: minKm < partMaxKm && maxKm > partMinKm
               if (minKm < partMaxKm && maxKm > partMinKm) {
                  return true; // Overlap found
               }
            }
         }
      }
      return false;
   }

   /**
    * Check if a switch is already used in any existing route
    * @param switchToCheck - The switch to check
    * @returns true if the switch is already used, false otherwise
    */
   private isSwitchAlreadyInRoute(switchToCheck: Switch): boolean {
      for (const route of this._routes) {
         for (const part of route.parts) {
            if (part.kind === "switch" && part.sw === switchToCheck) {
               return true;
            }
         }
      }
      return false;
   }

   /**
    * Create a TrainRoute starting at the given endpoint and store it.
    * Crawls forward along the rail network until the first signal (in direction) or an exit.
    * If the route ends at a switch, the route is invalid and null is returned.
    * direction is the direction of the train (1 for left to right, -1 for right to left).
    * @param signal - The signal that created this route (optional)
    * @param exit - The exit point if route starts from one (optional, will be auto-detected if route ends at one)
    * @returns The created TrainRoute or null if the route is invalid.
    */
   createAndStoreRoute(start: RouteEndpoint, direction: number = 1, signal: Signal | null = null, exit: Exit | null = null): TrainRoute | null {
      if (!start || !start.track) throw new Error("Start endpoint must include a valid track");
      if (direction !== 1 && direction !== -1) throw new Error("Direction must be 1 or -1");

      const parts: RoutePart[] = [];

      let currentTrack: Track = start.track;
      let currentKm: number = start.km;
      let currentDirection: number = direction >= 0 ? 1 : -1;
      let endsAtExit = false;

      // Protect against malformed layouts causing infinite loops
      const maxSteps = 1000;
      let steps = 0;
      let endEndpoint: RouteEndpoint | null = null;
      let nextElement: Track | Switch | Exit | null = null;

      const pushTrackSegment = (track: Track, fromKm: number, toKm: number): boolean => {
         if (fromKm === toKm) return true;

         // Check if this track segment overlaps with any existing route
         if (this.isTrackSegmentOverlapping(track, fromKm, toKm)) {
            return false; // Track segment overlaps, cannot create route
         }

         parts.push({ kind: "track", track, fromKm, toKm });
         return true;
      };

      const pushSwitchSegment = (sw: Switch): boolean => {
         // Check if this switch is already used in another route
         if (this.isSwitchAlreadyInRoute(sw)) {
            return false; // Switch already in use, cannot create route
         }

         parts.push({ kind: "switch", sw });
         return true;
      };

      while (steps++ < maxSteps) {
         // 1) Split at the next signal on the current track (any direction)
         const nextSignal = this._layout.getNextSignalOnTrackAnyDirection(currentTrack, currentKm, currentDirection);
         if (nextSignal) {
            const endKm = nextSignal.position;
            if (!pushTrackSegment(currentTrack, currentKm, endKm)) {
               // Track already in use, cannot create route
               return null;
            }
            currentKm = endKm;
            if (nextSignal.direction === currentDirection) {
               endEndpoint = { track: currentTrack, km: endKm };
               break;
            }
            continue;
         }

         // 2) Move to the boundary of the current track in travel direction
         const atEnd = currentDirection > 0;
         const boundaryKm = atEnd ? currentTrack.length : 0;
         const boundaryConnection = currentTrack.switches[atEnd ? 1 : 0];

         try {
            nextElement = this._layout.findNextTrack(currentTrack, currentDirection);
         } catch {
            // Dead end / malformed connection
            return null;
         }

         // Include the segment up to the boundary if there is distance to cover
         if (!pushTrackSegment(currentTrack, currentKm, boundaryKm)) {
            // Track already in use, cannot create route
            return null;
         }

         // 3) Resolve what is at the boundary
         if (nextElement instanceof Exit) {
            // Route ends at an exit
            endEndpoint = { track: currentTrack, km: boundaryKm };
            endsAtExit = true;
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
               if (!pushSwitchSegment(boundaryConnection)) {
                  // Switch already in use, cannot create route
                  return null;
               }
            }
            // Advance onto the next track. Enter from its start when going forward, end when going backward.
            currentTrack = nextElement;
            currentKm = currentDirection > 0 ? 0 : currentTrack.length;
            continue;
         }
      }

      if (endEndpoint) {
         // Use provided exit or detect if route ends at one
         const routeExit = exit || (endsAtExit ? (nextElement as Exit) : null);
         const route = new TrainRoute(start, endEndpoint, parts, signal, routeExit);
         this._routes.push(route);
         // Emit event that a route was created
         this._eventManager.emit('routeCreated', route);
         if (endsAtExit) {
            this._eventManager.emit('routeEndedAtExit', route, nextElement as Exit);
         }
         return route;
      }
      return null;
   }

   /**
    * Remove routes associated with a specific signal
    * @param signal - The signal whose routes should be removed
    * @returns true if any routes were removed, false otherwise
    */
   removeRoutesBySignal(signal: Signal): boolean {
      const initialLength = this._routes.length;
      this._routes = this._routes.filter(route => route.signal !== signal);
      const removed = this._routes.length < initialLength;

      if (removed) {
         // Emit event that routes were updated (some routes removed)
         this._eventManager.emit('routesCleared');
      }

      return removed;
   }

   /**
    * Remove a cleared track from all routes
    * Also removes leading switches and empty routes
    * @param clearedTrack - The track that was cleared
    * @returns true if any routes were modified or removed, false otherwise
    */
   removeRoutePartsByTrack(clearedTrack: Track, km: number | null = null, emitRoutesCleared: boolean = true): boolean {
      for (const route of this._routes) {
         // Remove the cleared track from this route
         for (const part of route.parts) {
            if (part.kind === "track" && part.track === clearedTrack && (km === null || part.toKm === km)) {
               route.parts.shift();
               route.removeFirstSwitchIfPresent();

               // Check if route is now empty
               if (route.isEmpty()) {
                  // If this route has an exit, emit event before removing
                  if (route.exit) {
                     this._eventManager.emit('routeWithExitCleared', route.exit);
                  }
                  this._routes = this._routes.filter(r => r !== route);
               }
               this._eventManager.emit('routesCleared');
               return true;
            }
         }
      }
      return false;
   }

   /**
    * Handle tail passing a signal or clearing a track
    * @param passed - The passed signal or cleared track
    */
   handleTrainTailPassed(passed: { track?: Track | null; km?: number }): void {
      if (!passed.track) return;
      this.removeRoutePartsByTrack(passed.track, passed.km ?? null, false);      
   }

   /**
    * Remove a specific route
    * @param route - The route to remove
    * @returns true if removed, false if not found
    */
   removeRoute(route: TrainRoute): boolean {
      const index = this._routes.indexOf(route);
      if (index !== -1) {
         this._routes.splice(index, 1);
         this._eventManager.emit('routesCleared');
         return true;
      }
      return false;
   }

   clearRoutes() {
      this._routes = [];
      // Emit event that routes were cleared
      this._eventManager.emit('routesCleared');
   }
}

export default TrainRouteManager;
