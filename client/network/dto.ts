export interface TrackLayoutDto {
  id: string;
  tracks: TrackDto[];
  switches: SwitchDto[];
  platforms?: PlatformDto[];
  maxExitDistance?: number;
  connections?: NetworkConnectionDto[];
}

export interface PlatformDto {
  track: number;
  from_km: number;
  to_km: number;
}

export interface ExitDto {
  id: number;
}

export interface TrackDto {
  id: number;
  start: PointDto;
  end: PointDto;
  signals: any[];
  switches: TrackSwitchDto[];
}

export interface TrackSwitchDto {
  type: string;
  id: number;
}

export interface SwitchDto {
  id: number;
  location: PointDto;
  tracks: (number | null)[];
}

export interface SignalDto {
  id: number;
  position: PointDto;
  trackId: string;
  state: 'red' | 'yellow' | 'green';
}

export interface StationDto {
  id: string;
  name: string;
  position: PointDto;
}

export interface PointDto {
  x: number;
  y: number;
}

// Simulation types
export type SimulationState = 'Stopped' | 'Running' | 'Paused' | 'Error';

export type TrainWayPointActionType = 'PassThrough' | 'Stop' | 'End';
export type TrainType = 'Passenger' | 'Freight' | 'MultipleUnit';

export interface SimulationStatusDto {
  state: SimulationState;
  errorMessage?: string;
  elapsedSeconds: number;
  currentTime: string;
  speed: number;
  timestamp?: string;
  scenarioId?: string;
}

export interface TrainDto {
  number: string;
  category?: string;
  speedMax?: number;
  type?: TrainType;
  state: string;
  currentLocation?: string;
}

export interface StationTimetableEventDto {
  trainNumber: string;
  category?: string;
  arrivalTime?: string | null;
  departureTime?: string | null;
  currentDelay: number;
  fromStation: string;
  nextStation: string;
}

export interface TrainDelayUpdatedNotificationDto {
  trainNumber: string;
  currentDelay: number;
}

export interface TrainRemovedNotificationDto {
  trainNumber: string;
}

export interface TrainWayPointDto {
  station: string;
  arrivalTime?: string | null;
  departureTime?: string | null;
  processed: boolean;
  isLast: boolean;
  stops: boolean;
  action: string;
}

export interface TrainDetailsDto {
  trainNumber: string;
  category?: string | null;
  type: TrainType;
  cars: number;
  speedMax: number; // m/s
  followingTrainNumber?: string | null;
}

export interface TrainEventDto {
  type: string;
  scheduledTime: string;
  processed: boolean;
  data: Record<string, unknown>;
}

export enum LogLevel {
  Debug = 0,
  Warning = 1,
  Error = 2,
  Emergency = 3,
}

export interface LogEntryDto {
  id?: number;
  simulationTime?: string;
  level: LogLevel;
  context: string;
  message: string;
}

export interface PlayerControlledStationDto {
  playerId: string;
  playerName: string;
  stationId: string;
}

// Scenario (planning) types from REST /api/scenarios
export interface ScenarioSummaryDto {
  id: string;
  title: string;
}

export interface ScenarioDto {
  title: string;
  layout: string; // layout ID
  start_time: string; // e.g., "08:00:00"
  trains: ScenarioTrainDto[];
}

export interface ScenarioTrainDto {
  number: string;
  type: TrainType;
  category?: string;
  speedMax: number; // km/h in source
  cars: number;
  path: string[];
  timetable: ScenarioTimetableEntryDto[];
  followingTrainNumber?: string;
}

export interface ScenarioTimetableEntryDto {
  station: string;
  arrival: string;   // may be HH:mm:ss or ISO
  departure: string; // may be HH:mm:ss or ISO
}

export interface NetworkStationDto {
  id: string;
  name: string;
  description?: string;
}

export interface NetworkDto {
  stations: NetworkStationDto[];
  connections: NetworkConnectionDto[];
}

export interface NetworkConnectionDto {
  from: string;
  fromId: number;
  to: string;
  toId: number;
  distance: number;
  mode?: string;
}

export interface OpenLineTrackStatusDto {
  from: string;
  fromExitId: number;
  to: string;
  toExitId: number;
  distance: number;
  mode?: string;
  trainNumber: string | null;
}

export interface GameMasterTrainDto {
  number: string;
  category?: string | null;
  type?: TrainType;
  completed: boolean;
  damaged: boolean;
  currentLocation?: string | null;
  headingForStation?: string | null;
  delay?: number;
  nextEventTime?: string | null;
  nextEventType?: string | null;
  spawnStation?: string | null;
}

export interface GameMasterSnapshotDto {
  trains: GameMasterTrainDto[];
  openLineTracks: OpenLineTrackStatusDto[];
  controlledStations: PlayerControlledStationDto[];
  majorEvents: MajorEventDto[];
  runningCount: number;
  finishedCount: number;
  removedCount: number;
  accidentCount: number;
  causedDelaySeconds: number;
}

export type MajorEventType = "MissedStop" | "Derailed" | "Collision" | "Removed";

export interface MajorEventDto {
  simulationTime: string;
  type: MajorEventType;
  trainNumber: string;
  otherTrainNumber?: string | null;
  station?: string | null;
  playerName?: string | null;
}