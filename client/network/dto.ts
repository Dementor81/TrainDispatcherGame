export interface TrackDto {
    id: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
    signals: number[];
    switches: { type: string; id: number }[];
  }
  
  export interface SwitchDto {
    id: number;
    location: { x: number; y: number };
    tracks: (number | null)[];
    branch: number;
    from: number;
  }
  
  export interface TrackLayoutDto {
    tracks: TrackDto[];
    switches: SwitchDto[];
  }