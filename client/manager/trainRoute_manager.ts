import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import Signal from "../sim/signal";
import TrainRoute, { RouteEndpoint, RoutePart } from "../sim/trainRoute";
import TrackLayoutManager from "./trackLayout_manager";
import { EventManager } from "./event_manager";
import RouteOccupancyStore from "./routeOccupancyStore";
import TrackOccupancyStore, { OccupiedElement } from "./trackOccupancyStore";
import Train from "../sim/train";

export class TrainRouteManager {
   private _routes: TrainRoute[] = [];
   private _layout: TrackLayoutManager;
   private _eventManager: EventManager;
   private _occupancy = new RouteOccupancyStore();
   private _trackOccupancy = new TrackOccupancyStore();

   constructor(layout: TrackLayoutManager, eventManager: EventManager) {
      this._layout = layout;
      this._eventManager = eventManager;
      this.subscribeToLocalEvents();
   }

   subscribeToLocalEvents() {
      this._eventManager.on("simulationStopped", () => {
         this.clearRoutes();
      });
      this._eventManager.on("trainTransformed", (train: Train, oldNumber: string) => {
         this.setTrackOccupancy(oldNumber, []);
         this.syncTrainOccupancy(train);
      });
   }

   get routes(): TrainRoute[] {
      return this._routes;
   }

   get occupiedElements(): Set<OccupiedElement> {
      return this._trackOccupancy.all();
   }

   isSwitchLocked(sw: Switch): boolean {
      return this._occupancy.isSwitchOccupied(sw) || this._trackOccupancy.isOccupied(sw);
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
         if (this._trackOccupancy.isAnyOccupied(track.sectionsBetween(fromKm, toKm))) {
            console.warn(`Route refused: track ${track.id} km ${fromKm}-${toKm} is occupied`);
            return false;
         }

         parts.push({ kind: "track", track, fromKm, toKm });
         return true;
      };

      const pushSwitchSegment = (sw: Switch): boolean => {
         if (this._occupancy.isSwitchOccupied(sw) || this._trackOccupancy.isOccupied(sw)) {
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
            if (this._trackOccupancy.isOccupied(nextElement)) {
               return null;
            }
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

   removeRoutesBySignal(signal: Signal): TrainRoute[] {
      const removed = this._occupancy.removeBySignal(signal);
      if (removed.length === 0) return removed;
      this._routes = this._routes.filter(route => !removed.includes(route));
      this._eventManager.emit('routesCleared');
      return removed;
   }

   syncTrainOccupancy(train: Train): void {
      const head = train.position;
      const tail = train.tailPosition;
      if (!head || !tail) return;

      const elements = this._layout.occupiedElementsBetween(tail, head, train.movingDirection);
      const left = [...this._trackOccupancy.forTrain(train.number)].filter(element => !elements.includes(element));
      this.setTrackOccupancy(train.number, elements);
      for (const element of left) {
         if (element instanceof Exit) this._eventManager.emit('exitCleared', element);
      }

      this._occupancy.claimOverlappingUnclaimed(train.number, head.track, head.km);
      if (!this._occupancy.releaseBehindTail(train.number, tail.track, tail.km, head.track, head.km)) return;
      this._routes = this._routes.filter(route => !route.isEmpty());
      this._eventManager.emit('routesCleared');
   }

   reverseOccupancy(trainNumber: string): void {
      this._occupancy.reverseTrain(trainNumber);
   }

   /** A train leaving through an exit keeps that exit occupied until the neighbour reports its arrival. */
   removeOccupancyForTrain(train: Train): void {
      const exit = train.exitId !== null ? this._layout.getExitById(train.exitId) : null;
      this.setTrackOccupancy(train.number, exit ? [exit] : []);

      const released = this._occupancy.removeTrain(train.number);
      if (released.length === 0) return;
      this._routes = this._routes.filter(route => !released.includes(route));
      this._eventManager.emit('routesCleared');
   }

   holdExit(trainNumber: string, exit: Exit): void {
      this.setTrackOccupancy(trainNumber, [exit]);
   }

   releaseExit(exit: Exit): void {
      if (this._trackOccupancy.release(exit)) this._eventManager.emit('occupancyChanged');
   }

   clearTrackOccupancy(): void {
      this._trackOccupancy.clear();
      this._eventManager.emit('occupancyChanged');
   }

   private setTrackOccupancy(trainNumber: string, elements: Iterable<OccupiedElement>): void {
      if (this._trackOccupancy.setTrain(trainNumber, elements)) this._eventManager.emit('occupancyChanged');
   }

   clearRoutes() {
      this._routes = [];
      this._occupancy.clear();
      this._trackOccupancy.clear();
      this._eventManager.emit('routesCleared');
   }
}

export default TrainRouteManager;
