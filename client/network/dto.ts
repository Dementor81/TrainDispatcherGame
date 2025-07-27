export interface TrackLayoutDto {
  id: string;
  title: string;
  exits: ExitDto[];
  tracks: TrackDto[];
  switches: SwitchDto[];
}

export interface ExitDto {
  destination: string;
  id: number;
}

export interface TrackDto {
  _class: string;
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
  _class: string;
  id: number;
  location: PointDto;
  tracks: (number | null)[];
  branch: number;
  from: number;
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