import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import Signal from "../sim/signal";
import TrainRoute, { RouteEndpoint, RoutePart } from "../sim/trainRoute";
import TrackLayoutManager from "./trackLayout_manager";
import { EventManager } from "./event_manager";
import RouteOccupancyStore from "./routeOccupancyStore";
import RailPosition from "../sim/railPosition";

export class TrainRouteManager {
   private _routes: TrainRoute[] = [];
   private _layout: TrackLayoutManager;
   private _eventManager: EventManager;
   private _occupancy = new RouteOccupancyStore();

   constructor(layout: TrackLayoutManager, eventManager: EventManager) {
      this._layout = layout;
      this._eventManager = eventManager;
      this.subscribeToLocalEvents();
   }

   subscribeToLocalEvents() {
      this._eventManager.on("simulationStopped", () => {
         this.clearRoutes();
      });
   }

   get routes(): TrainRoute[] {
      return this._routes;
   }

   private isBumperAt(track: Track, km: number): boolean {
      if (km === 0) return track.switches[0] == null;
      if (km === track.length) return track.switches[1] == null;
      return false;
   }

   private routeEndsAtBumper(route: TrainRoute): boolean {
      return this.isBumperAt(route.end.track, route.end.km);
   }

   private releaseArrivedBumperRoutes(track: Track): void {
      const leftover = this._routes.filter(route =>
         this.routeEndsAtBumper(route) &&
         route.end.track === track &&
         route.parts.every(part => part.kind !== "track" || part.track === track)
      );
      for (const route of leftover) {
         this.removeRoute(route);
      }
   }

   createAndStoreRoute(
      start: RouteEndpoint,
      direction: number = 1,
      signal: Signal | null = null,
      exit: Exit | null = null,
      trainNumber: string | null = null
   ): TrainRoute | null {
      if (!start || !start.track) throw new Error("Start endpoint must include a valid track");
      if (direction !== 1 && direction !== -1) throw new Error("Direction must be 1 or -1");

      this.releaseArrivedBumperRoutes(start.track);

      const parts: RoutePart[] = [];

      let currentTrack: Track = start.track;
      let currentKm: number = start.km;
      let currentDirection: number = direction >= 0 ? 1 : -1;
      let endsAtExit = false;

      const maxSteps = 1000;
      let steps = 0;
      let endEndpoint: RouteEndpoint | null = null;
      let nextElement: Track | Switch | Exit | null = null;

      const pushTrackSegment = (track: Track, fromKm: number, toKm: number): boolean => {
         if (fromKm === toKm) return true;

         if (this._occupancy.isTrackSegmentOverlapping(track, fromKm, toKm)) {
            return false;
         }

         parts.push({ kind: "track", track, fromKm, toKm });
         return true;
      };

      const pushSwitchSegment = (sw: Switch): boolean => {
         if (this._occupancy.isSwitchOccupied(sw)) {
            return false;
         }

         parts.push({ kind: "switch", sw });
         return true;
      };

      while (steps++ < maxSteps) {
         const nextSignal = this._layout.getNextSignalOnTrackAnyDirection(currentTrack, currentKm, currentDirection);
         if (nextSignal) {
            const endKm = nextSignal.position;
            if (!pushTrackSegment(currentTrack, currentKm, endKm)) {
               return null;
            }
            currentKm = endKm;
            if (nextSignal.direction === currentDirection) {
               endEndpoint = { track: currentTrack, km: endKm };
               break;
            }
            continue;
         }

         const atEnd = currentDirection > 0;
         const boundaryKm = atEnd ? currentTrack.length : 0;
         const boundaryConnection = currentTrack.switches[atEnd ? 1 : 0];

         if (boundaryConnection == null) {
            if (!pushTrackSegment(currentTrack, currentKm, boundaryKm)) {
               return null;
            }
            endEndpoint = { track: currentTrack, km: boundaryKm };
            break;
         }

         try {
            nextElement = this._layout.findNextTrack(currentTrack, currentDirection);
         } catch {
            return null;
         }

         if (!pushTrackSegment(currentTrack, currentKm, boundaryKm)) {
            return null;
         }

         if (nextElement instanceof Exit) {
            endEndpoint = { track: currentTrack, km: boundaryKm };
            endsAtExit = true;
            break;
         }

         if (nextElement instanceof Switch) {
            console.error("Route ended at a switch, which is invalid");
            return null;
         }

         if (nextElement instanceof Track) {
            if (boundaryConnection instanceof Switch) {
               if (!pushSwitchSegment(boundaryConnection)) {
                  return null;
               }
            }
            currentTrack = nextElement;
            currentKm = currentDirection > 0 ? 0 : currentTrack.length;
            continue;
         }
      }

      if (endEndpoint) {
         const routeExit = exit || (endsAtExit ? (nextElement as Exit) : null);
         const route = new TrainRoute(start, endEndpoint, parts, signal, routeExit, endsAtExit);
         this._routes.push(route);
         this._occupancy.add(route, trainNumber);
         this._eventManager.emit('routeCreated', route);
         if (endsAtExit) {
            this._eventManager.emit('routeEndedAtExit', route, nextElement as Exit);
         }
         return route;
      }
      return null;
   }

   removeRoutesBySignal(signal: Signal): boolean {
      const removed = this._occupancy.removeBySignal(signal);
      if (removed.length === 0) return false;
      this._routes = this._routes.filter(route => !removed.includes(route));
      this._eventManager.emit('routesCleared');
      return true;
   }

   syncTrainOccupancy(trainNumber: string, head: RailPosition, tail: RailPosition): void {
      this._occupancy.claimOverlappingUnclaimed(trainNumber, head.track, head.km);
      const { exits, changed } = this._occupancy.releaseBehindTail(
         trainNumber,
         tail.track,
         tail.km,
         head.track,
         head.km
      );
      if (!changed && exits.length === 0) return;
      this._routes = this._routes.filter(route => !route.isEmpty());
      this.emitOccupancyCleared(exits);
   }

   reverseOccupancy(trainNumber: string): void {
      this._occupancy.reverseTrain(trainNumber);
   }

   removeOccupancyForTrain(trainNumber: string): void {
      const owned = this._occupancy.routesForTrain(trainNumber);
      if (owned.length === 0) return;
      const { exits, released } = this._occupancy.removeTrain(trainNumber);
      this._routes = this._routes.filter(route => !released.includes(route));
      if (exits.length === 0 && released.length === 0) {
         this._eventManager.emit('routesCleared');
         return;
      }
      this.emitOccupancyCleared(exits);
   }

   removeRoute(route: TrainRoute): boolean {
      const index = this._routes.indexOf(route);
      if (index === -1) return false;
      this._routes.splice(index, 1);
      this._occupancy.removeRoute(route);
      this._eventManager.emit('routesCleared');
      return true;
   }

   clearRoutes() {
      this._routes = [];
      this._occupancy.clear();
      this._eventManager.emit('routesCleared');
   }

   private emitOccupancyCleared(exits: Exit[]): void {
      const seen = new Set<number>();
      for (const exit of exits) {
         if (seen.has(exit.id)) continue;
         seen.add(exit.id);
         this._eventManager.emit('routeWithExitCleared', exit);
      }
      this._eventManager.emit('routesCleared');
   }
}

export default TrainRouteManager;
