import type { NetworkDto, TrackLayoutDto } from "../../network/dto";
import { fetchLayout } from "../../network/api";

/**
 * Utility functions for working with rail network topology and station exit spans
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

/**
 * Finds a connection between two stations in either direction
 */
export function findConnection(network: NetworkDto, a: string, b: string) {
   return network.connections.find((c) => c.from === a && c.to === b);
}

/**
 * Calculates the distance between two stations including exit spans
 * @param network - The network containing connections
 * @param a - First station name
 * @param b - Second station name
 * @returns Total distance in meters (connection distance + half of each station's exit span)
 */
export function getDistanceMeters(network: NetworkDto, a: string, b: string): number {
   const conn = findConnection(network, a, b) || findConnection(network, b, a);
   const base = conn ? conn.distance : 0;
   const extra = getStationExitSpan(a) * 0.5 + getStationExitSpan(b) * 0.5;
   console.log(`Distance between ${a} and ${b}: ${base} + ${extra} = ${base + extra}`);
   return base + extra;
}

/**
 * Determines if a section between two stations is single-track
 * @param network - The network containing connections
 * @param a - First station name
 * @param b - Second station name
 * @returns true if the section is single-track
 */
export function isSingleTrackSection(network: NetworkDto, a: string, b: string): boolean {
   const pairCount = network.connections.filter(
      (c) => (c.from === a && c.to === b) || (c.from === b && c.to === a)
   ).length;
   if (pairCount === 1) return true;
   // fallback to mode flag if provided by server
   return network.connections.some(
      (c) => ((c.from === a && c.to === b) || (c.from === b && c.to === a)) && (c as any).mode === "SingleTrack"
   );
}

/**
 * Derives an ordered list of stations from the network topology
 * Uses a greedy approach starting from endpoints (stations with in-degree 0)
 * @param network - The network containing stations and connections
 * @returns Ordered array of station names
 */
export function deriveOrderedStations(network: NetworkDto): string[] {
   // Build adjacency and in-degree counts to find a path-like order across the network.
   const adj = new Map<string, string[]>();
   const indeg = new Map<string, number>();
   const stations = new Set<string>();
   for (const c of network.connections) {
      stations.add(c.from);
      stations.add(c.to);
      if (!adj.has(c.from)) adj.set(c.from, []);
      adj.get(c.from)!.push(c.to);
      indeg.set(c.to, (indeg.get(c.to) || 0) + 1);
      if (!indeg.has(c.from)) indeg.set(c.from, indeg.get(c.from) || 0);
   }

   if (stations.size === 0) return [];

   // Prefer endpoints with indegree 0 as start; else pick an arbitrary station
   let start: string | null = null;
   for (const s of Array.from(stations)) {
      if ((indeg.get(s) || 0) === 0) {
         start = s;
         break;
      }
   }
   if (!start) start = Array.from(stations)[0] ?? null;
   if (!start) return [];

   // Walk forward greedily following single outgoing edges to construct an ordered chain
   const order: string[] = [];
   const visited = new Set<string>();
   let current: string | null = start;
   while (current && !visited.has(current)) {
      order.push(current);
      visited.add(current);
      const outs: string[] = adj.get(current) || [];
      if (outs.length >= 1) {
         current = outs[0];
      } else {
         current = null;
      }
   }

   // Ensure any remaining stations are appended (in case of branches)
   for (const s of Array.from(stations)) {
      if (!visited.has(s)) order.push(s);
   }
   return order;
}


