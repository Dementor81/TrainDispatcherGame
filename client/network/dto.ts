export interface TrackLayoutDto {
  id: string;
  tracks: TrackDto[];
  switches: SwitchDto[];
  maxExitDistance?: number;
  connections?: NetworkConnectionDto[];
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

export interface SimulationStatusDto {
  state: SimulationState;
  errorMessage?: string;
  elapsedSeconds: number;
  currentTime: string;
  speed?: number;
}

export interface TrainDto {
  number: string;
  category?: string;
  type?: 'Passenger' | 'Freight';
  state: string;
  currentLocation?: string;
}

export interface StationTimetableEventDto {
  trainNumber: string;
  category?: string;
  arrival: string;
  departure: string;
  currentDelay: number;
  fromStation: string;
  nextStation: string;
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
  type: 'Passenger' | 'Freight';
  category?: string;
  speed: number; // km/h in source
  cars: number;
  path: string[];
  timetable: ScenarioTimetableEntryDto[];
}

export interface ScenarioTimetableEntryDto {
  station: string;
  arrival: string;   // may be HH:mm:ss or ISO
  departure: string; // may be HH:mm:ss or ISO
}

export interface NetworkDto {
  stations: string[];
  connections: NetworkConnectionDto[];
}

export interface NetworkConnectionDto {
  from: string;
  fromId: number;
  to: string;
  toId: number;
  distance: number;
  blocks: number;
  mode?: string;
}

export interface OpenLineTrackStatusDto {
  from: string;
  fromExitId: number;
  to: string;
  toExitId: number;
  distance: number;
  blocks: number;
  mode?: string;
  trains: string[];
}