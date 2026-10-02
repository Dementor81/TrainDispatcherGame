import TrackSection from "../sim/trackSection";
import Switch from "../sim/switch";
import Exit from "../sim/exit";

export type OccupiedElement = TrackSection | Switch | Exit;

/**
 * Which track elements are physically occupied, per train.
 * An element is occupied while at least one train's set contains it, so
 * several trains sharing a section need no counting.
 */
export class TrackOccupancyStore {
   private _byTrain = new Map<string, Set<OccupiedElement>>();

   forTrain(trainNumber: string): Set<OccupiedElement> {
      return this._byTrain.get(trainNumber) ?? new Set();
   }

   /** Replaces the train's occupied elements. Returns true if anything changed. */
   setTrain(trainNumber: string, elements: Iterable<OccupiedElement>): boolean {
      const next = new Set(elements);
      const previous = this._byTrain.get(trainNumber);
      const unchanged = previous
         ? previous.size === next.size && [...next].every(element => previous.has(element))
         : next.size === 0;
      if (unchanged) return false;

      if (next.size === 0) this._byTrain.delete(trainNumber);
      else this._byTrain.set(trainNumber, next);
      return true;
   }

   /** Removes the element from every train. Returns true if anything changed. */
   release(element: OccupiedElement): boolean {
      let changed = false;
      for (const [trainNumber, elements] of this._byTrain) {
         if (!elements.delete(element)) continue;
         changed = true;
         if (elements.size === 0) this._byTrain.delete(trainNumber);
      }
      return changed;
   }

   isOccupied(element: OccupiedElement): boolean {
      for (const elements of this._byTrain.values()) {
         if (elements.has(element)) return true;
      }
      return false;
   }

   isAnyOccupied(elements: Iterable<OccupiedElement>): boolean {
      for (const element of elements) {
         if (this.isOccupied(element)) return true;
      }
      return false;
   }

   all(): Set<OccupiedElement> {
      const all = new Set<OccupiedElement>();
      for (const elements of this._byTrain.values()) {
         for (const element of elements) all.add(element);
      }
      return all;
   }

   clear(): void {
      this._byTrain.clear();
   }
}

export default TrackOccupancyStore;
