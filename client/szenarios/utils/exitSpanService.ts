import { fetchLayout } from "../../network/api";
import type { NetworkDto, TrackLayoutDto } from "../../network/dto";

/**
 * Service for managing station exit span distances.
 * Exit spans represent the distance from station center to the exit points.
 */

// Cache of per-station exit span (meters)
const stationExitSpanMeters: Map<string, number> = new Map();

/**
 * Precomputes and caches exit span distances for all stations in the network
 * by fetching their individual layouts and reading maxExitDistance
 */
export async function precomputeExitSpans(network: NetworkDto): Promise<void> {
   const stationSet = new Set<string>();
   for (const s of network.stations || []) stationSet.add(s);
   for (const c of network.connections || []) {
      if (c.from) stationSet.add(c.from);
      if (c.to) stationSet.add(c.to);
   }
   const tasks: Promise<void>[] = [];
   stationSet.forEach((station) => {
      tasks.push(
         (async () => {
            try {
               const layout: TrackLayoutDto = await fetchLayout(station);
               const span = typeof layout.maxExitDistance === "number" ? layout.maxExitDistance : 0;
               stationExitSpanMeters.set(station, span);
            } catch {
               // Ignore missing layouts
               stationExitSpanMeters.set(station, 0);
            }
         })()
      );
   });
   await Promise.all(tasks);
}

/**
 * Gets the cached exit span distance for a station
 * @param station - Station name
 * @returns Exit span in meters, or 0 if not found
 */
export function getStationExitSpan(station: string): number {
   return stationExitSpanMeters.get(station) || 0;
}

/**
 * Clears the exit span cache (useful for testing or when reloading networks)
 */
export function clearExitSpanCache(): void {
   stationExitSpanMeters.clear();
}

