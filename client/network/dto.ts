export interface TrackLayoutDto {
  id: string;
  exits: ExitDto[];
  tracks: TrackDto[];
  switches: SwitchDto[];
}

export interface ExitDto {
  destination: string;
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
}

export interface TrainDto {
  number: string;
  state: string;
  currentLocation?: string;
  spawnTime?: string;
}

export interface StationTimetableEventDto {
  trainNumber: string;
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
  start_time: string; // e.g., "08:00:00"
  trains: ScenarioTrainDto[];
}

export interface ScenarioTrainDto {
  number: string;
  type: string;
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
  fromId: string;
  to: string;
  toId: string;
  distance: number;
  blocks: number;
  mode?: string;
}