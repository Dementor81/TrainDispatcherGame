import type { NetworkDto } from "../../network/dto";
import { findConnection } from "./railNetworkUtils";

/**
 * Represents a conflict between two trains occupying the same track section simultaneously
 */
export interface TrainConflict {
  train1Index: number;
  train2Index: number;
  fromStation: string;
  toStation: string;
  startTimeMinutes: number;
  endTimeMinutes: number;
}

/**
 * Represents a train segment (movement between two consecutive stations)
 */
interface TrainSegment {
  trainIndex: number;
  fromStation: string;
  toStation: string;
  departureMinutes: number;
  arrivalMinutes: number;
}

/**
 * Converts time string to minutes since midnight
 */
function toMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  const hours = parseInt(parts[0] || "0", 10);
  const minutes = parseInt(parts[1] || "0", 10);
  const seconds = parseInt(parts[2] || "0", 10);
  return hours * 60 + minutes + seconds / 60;
}

/**
 * Determines the direction of travel based on the NetworkConnection
 * Returns the canonical from->to direction for a connection between two stations
 */
function getConnectionDirection(
  network: NetworkDto,
  stationA: string,
  stationB: string
): { from: string; to: string } | null {
  const conn = findConnection(network, stationA, stationB);
  if (conn) return { from: conn.from, to: conn.to };
  
  const reverseConn = findConnection(network, stationB, stationA);
  if (reverseConn) return { from: reverseConn.from, to: reverseConn.to };
  
  return null;
}

/**
 * Checks if two trains are traveling in the same direction on a connection
 */
function isSameDirection(
  network: NetworkDto,
  seg1FromStation: string,
  seg1ToStation: string,
  seg2FromStation: string,
  seg2ToStation: string
): boolean {
  const dir1 = getConnectionDirection(network, seg1FromStation, seg1ToStation);
  const dir2 = getConnectionDirection(network, seg2FromStation, seg2ToStation);
  
  if (!dir1 || !dir2) return false;
  
  // Check if both segments travel in the same direction based on the NetworkConnection
  // Segment 1: from seg1FromStation to seg1ToStation
  // Segment 2: from seg2FromStation to seg2ToStation
  
  // Both must use the same underlying NetworkConnection in the same direction
  const seg1Forward = dir1.from === seg1FromStation && dir1.to === seg1ToStation;
  const seg2Forward = dir2.from === seg2FromStation && dir2.to === seg2ToStation;
  
  // They're in the same direction if they both use the same NetworkConnection
  // and both are either forward or both are reverse
  return dir1.from === dir2.from && dir1.to === dir2.to && seg1Forward === seg2Forward;
}

/**
 * Checks if two time windows overlap
 */
function timeWindowsOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  // Two time windows overlap if NOT (one ends before the other starts)
  return !(end1 <= start2 || end2 <= start1);
}

/**
 * Extracts all train segments from a train's timetable
 */
function extractTrainSegments(train: any, trainIndex: number): TrainSegment[] {
  const segments: TrainSegment[] = [];
  const timetable = train.timetable || [];
  
  for (let i = 0; i < timetable.length - 1; i++) {
    const current = timetable[i];
    const next = timetable[i + 1];
    
    // Skip if missing required data
    if (!current.station || !next.station) continue;
    
    // Get departure time from current station
    const departureStr = current.departure;
    if (!departureStr) continue;
    
    // Get arrival time at next station
    const arrivalStr = next.arrival;
    if (!arrivalStr) continue;
    
    const departureMinutes = toMinutes(departureStr);
    const arrivalMinutes = toMinutes(arrivalStr);
    
    segments.push({
      trainIndex,
      fromStation: current.station,
      toStation: next.station,
      departureMinutes,
      arrivalMinutes,
    });
  }
  
  return segments;
}

/**
 * Detects all collisions between trains in a scenario
 * Two trains collide if they occupy the same track section (direct NetworkConnection)
 * at the same time, traveling in the same direction
 */
export function detectCollisions(trains: any[], network: NetworkDto): TrainConflict[] {
  if (!trains || !network) return [];
  
  const conflicts: TrainConflict[] = [];
  
  // Extract all segments from all trains
  const allSegments: TrainSegment[] = [];
  for (let i = 0; i < trains.length; i++) {
    const segments = extractTrainSegments(trains[i], i);
    allSegments.push(...segments);
  }
  
  // Compare all pairs of segments
  for (let i = 0; i < allSegments.length; i++) {
    for (let j = i + 1; j < allSegments.length; j++) {
      const seg1 = allSegments[i];
      const seg2 = allSegments[j];
      
      // Skip if same train
      if (seg1.trainIndex === seg2.trainIndex) continue;
      
      // Check if they use the same connection in the same direction
      if (!isSameDirection(
        network,
        seg1.fromStation,
        seg1.toStation,
        seg2.fromStation,
        seg2.toStation
      )) {
        continue;
      }
      
      // Check if time windows overlap
      if (timeWindowsOverlap(
        seg1.departureMinutes,
        seg1.arrivalMinutes,
        seg2.departureMinutes,
        seg2.arrivalMinutes
      )) {
        // Calculate the actual overlap time window
        const overlapStart = Math.max(seg1.departureMinutes, seg2.departureMinutes);
        const overlapEnd = Math.min(seg1.arrivalMinutes, seg2.arrivalMinutes);
        
        conflicts.push({
          train1Index: seg1.trainIndex,
          train2Index: seg2.trainIndex,
          fromStation: seg1.fromStation,
          toStation: seg1.toStation,
          startTimeMinutes: overlapStart,
          endTimeMinutes: overlapEnd,
        });
      }
    }
  }
  
  return conflicts;
}
