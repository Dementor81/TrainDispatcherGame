import TrainRoute, { RoutePart } from "../sim/trainRoute";
import Track from "../sim/track";
import Switch from "../sim/switch";
import Signal from "../sim/signal";
import Exit from "../sim/exit";

export class RouteOccupancyStore {
   private _unclaimed = new Set<TrainRoute>();
   private _byTrain = new Map<string, TrainRoute[]>();

   add(route: TrainRoute, trainNumber: string | null): void {
      if (trainNumber) this.addForTrain(trainNumber, route);
      else this._unclaimed.add(route);
   }

   addForTrain(trainNumber: string, route: TrainRoute): void {
      this._unclaimed.delete(route);
      const list = this._byTrain.get(trainNumber) ?? [];
      if (!list.includes(route)) list.push(route);
      this._byTrain.set(trainNumber, list);
   }

   claimOverlappingUnclaimed(trainNumber: string, track: Track, km: number): boolean {
      let claimed = false;
      for (const route of [...this._unclaimed]) {
         if (route.containsPosition(track, km)) {
            this.addForTrain(trainNumber, route);
            claimed = true;
         }
      }
      return claimed;
   }

   routesForTrain(trainNumber: string): TrainRoute[] {
      return this._byTrain.get(trainNumber) ?? [];
   }

   isTrackSegmentOverlapping(track: Track, fromKm: number, toKm: number): boolean {
      const minKm = Math.min(fromKm, toKm);
      const maxKm = Math.max(fromKm, toKm);

      for (const part of this.allTrackParts()) {
         if (part.track !== track) continue;
         const partFromKm = part.fromKm ?? 0;
         const partToKm = part.toKm ?? track.length;
         const partMinKm = Math.min(partFromKm, partToKm);
         const partMaxKm = Math.max(partFromKm, partToKm);
         if (minKm < partMaxKm && maxKm > partMinKm) return true;
      }
      return false;
   }

   isSwitchOccupied(switchToCheck: Switch): boolean {
      for (const route of this.allRoutes()) {
         for (const part of route.parts) {
            if (part.kind === "switch" && part.sw === switchToCheck) return true;
         }
      }
      return false;
   }

   releaseBehindTail(
      trainNumber: string,
      tailTrack: Track,
      tailKm: number,
      headTrack: Track | null,
      headKm: number | null
   ): { exits: Exit[]; changed: boolean } {
      const exits: Exit[] = [];
      let changed = false;
      for (const route of [...this.routesForTrain(trainNumber)]) {
         const remaining = route.parts.length;
         if (route.containsPosition(tailTrack, tailKm)) {
            route.releaseBehindTail(tailTrack, tailKm);
         } else if (headTrack && headKm !== null && route.containsPosition(headTrack, headKm)) {
            continue;
         } else if (route.endsAtExit) {
            continue;
         } else {
            route.clearParts();
         }

         if (route.parts.length === remaining) continue;
         changed = true;
         if (!route.isEmpty()) continue;
         this.detach(route);
         if (route.exit) exits.push(route.exit);
      }
      return { exits, changed };
   }

   reverseTrain(trainNumber: string): void {
      for (const route of this.routesForTrain(trainNumber)) {
         route.reverseParts();
      }
   }

   removeTrain(trainNumber: string): { exits: Exit[]; released: TrainRoute[] } {
      const routes = this._byTrain.get(trainNumber) ?? [];
      this._byTrain.delete(trainNumber);
      const exits: Exit[] = [];
      const released: TrainRoute[] = [];
      for (const route of routes) {
         if (route.endsAtExit && !route.isEmpty()) {
            this._unclaimed.add(route);
            continue;
         }
         route.clearParts();
         this._unclaimed.delete(route);
         released.push(route);
         if (route.exit) exits.push(route.exit);
      }
      return { exits, released };
   }

   removeRoute(route: TrainRoute): void {
      this.detach(route);
   }

   removeBySignal(signal: Signal): TrainRoute[] {
      const removed: TrainRoute[] = [];
      for (const route of [...this.allRoutes()]) {
         if (route.signal !== signal) continue;
         this.detach(route);
         removed.push(route);
      }
      return removed;
   }

   clear(): void {
      this._unclaimed.clear();
      this._byTrain.clear();
   }

   private detach(route: TrainRoute): void {
      this._unclaimed.delete(route);
      for (const [trainNumber, list] of this._byTrain) {
         const next = list.filter(entry => entry !== route);
         if (next.length > 0) this._byTrain.set(trainNumber, next);
         else this._byTrain.delete(trainNumber);
      }
   }

   private *allRoutes(): Iterable<TrainRoute> {
      yield* this._unclaimed;
      for (const list of this._byTrain.values()) {
         yield* list;
      }
   }

   private *allTrackParts(): Iterable<Extract<RoutePart, { kind: "track" }>> {
      for (const route of this.allRoutes()) {
         for (const part of route.parts) {
            if (part.kind === "track") yield part;
         }
      }
   }
}

export default RouteOccupancyStore;
