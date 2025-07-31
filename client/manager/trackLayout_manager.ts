import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import Signal from "../sim/signal";
import Train from "../sim/train";
import api from "../network/api";
import Storage from "../core/storage";
import { Renderer } from "../canvas/renderer";
import { Application } from "../core/application";

// Movement exception for actual errors
export class MovementException extends Error {
   constructor(message: string) {
      super(message);
      this.name = "MovementException";
   }
}

export class TrackLayoutManager {
   private _tracks: Track[] = [];
   private _switches: Switch[] = [];
   private _exits: Exit[] = [];
   private _signals: Signal[] = [];
   private _renderer: Renderer | null = null;
   private _onLayoutLoaded: (() => void) | null = null;
   private _application: Application;

   constructor(application: Application) {
      this._tracks = [];
      this._switches = [];
      this._exits = [];
      this._signals = [];
      this._application = application;
   }

   setRenderer(renderer: Renderer): void {
      this._renderer = renderer;

      this._application.eventManager.on("switchClicked", (sw: Switch) => {
         console.log(`Switch ${sw.id} clicked`);
         this.handleSwitchClick(sw);
      });

      this._application.eventManager.on("signalClicked", (signal: Signal, track: Track) => {
         console.log(`Signal at km ${signal.position} on track ${track.id} clicked`);
         this.handleSignalClick(signal, track);
      });

      this._application.eventManager.on("trainPassedSignal", (train: Train, signal: Signal, track: Track) => {
         console.log(`Train ${train.number} passed signal at km ${signal.position} on track ${track.id}`);
         this.handleTrainPassedSignal(train, signal, track);
      });
   }

   setOnLayoutLoaded(callback: () => void): void {
      this._onLayoutLoaded = callback;
   }

   get tracks(): Track[] {
      return this._tracks;
   }

   get switches(): Switch[] {
      return this._switches;
   }

   get exits(): Exit[] {
      return this._exits;
   }

   get signals(): Signal[] {
      return this._signals;
   }

   // Find the track and kilometer position for an exit point
   getExitPointLocation(exitPointId: string): { track: Track | null; km: number } {
      const exitId = parseInt(exitPointId);

      // Find the track that has this exit
      for (const track of this._tracks) {
         for (let i = 0; i < track.switches.length; i++) {
            const switchItem = track.switches[i];
            if (switchItem instanceof Exit && switchItem.id === exitId) {
               // Exit found! Determine the kilometer position
               let km: number;
               if (i === 0) {
                  // Exit is at the start of the track
                  km = 0;
               } else if (i === 1) {
                  // Exit is at the end of the track
                  km = track.length;
               } else {
                  // This shouldn't happen with current structure, but handle it
                  km = 0;
               }

               console.log(`Found exit ${exitId} on track ${track.id} at km ${km}`);
               return { track, km };
            }
         }
      }

      console.warn(`Exit point ${exitPointId} not found in track layout`);
      return { track: null, km: 0 };
   }

   getExitPointDirection(exitPointId: string): number {
      const exitId = parseInt(exitPointId);
      const exit = this._exits.find((e) => e.id === exitId);
      // Find the track that has this exit
      for (const track of this._tracks) {
         for (let i = 0; i < track.switches.length; i++) {
            const switchItem = track.switches[i];
            if (switchItem instanceof Exit && switchItem.id === exitId) {
               // If exit is at the start of the track (index 0), direction is positive (1)
               // If exit is at the end of the track (index 1), direction is negative (-1)
               if (i === 0) {
                  return 1;
               } else {
                  return -1;
               }
            }
         }
      }
      throw new Error(`Exit point ${exitPointId} not found in track layout`);
   }

   async loadTrackLayout(layoutID: string): Promise<void> {
      console.log("Loading track layout:", layoutID);
      try {
         const trackLayoutDto = await api.fetchLayout(layoutID);
         const trackLayout: { tracks: Track[]; switches: Switch[]; exits: Exit[]; signals: Signal[] } | null =
            Storage.loadTrackLayoutFromJson(trackLayoutDto);
         if (trackLayout === null) {
            console.error("Failed to load track layout");
            return;
         }
         this._tracks = trackLayout.tracks;
         this._switches = trackLayout.switches;
         this._exits = trackLayout.exits;
         this._signals = trackLayout.signals;
         console.log(
            "Track layout loaded:",
            this._tracks.length,
            "tracks,",
            this._switches.length,
            "switches,",
            this._exits.length,
            "exits,",
            this._signals.length,
            "signals"
         );

         // Notify that layout is loaded
         if (this._onLayoutLoaded) {
            this._onLayoutLoaded();
         }
      } catch (error) {
         console.error("Failed to load track layout:", error);
      }
   }

   private handleSwitchClick(sw: Switch): void {
      sw.toggle();
   }

   private handleSignalClick(signal: Signal, track: Track): void {
      // Toggle signal state
      signal.state = !signal.state;
      console.log(`Signal at km ${signal.position} on track ${track.id} changed to ${signal.state ? 'green' : 'red'}`);
      
      // Redraw the signal to reflect new state
      if (this._renderer) {
         this._renderer.redrawSignal(signal, track);
      }

      // If signal changed to green, check if any trains can resume
      if (signal.state) {
         // Get TrainManager from Application to resume trains
         const trainManager = this._application.trainManager;
         if (trainManager) {
            trainManager.resumeTrainsStoppedBySignals();
         }
      }
   }

   private handleTrainPassedSignal(train: Train, signal: Signal, track: Track): void {
      // Automatically set signal to red (stop) after train passes
      if (signal.state) {
         signal.state = false; // Set to red
         console.log(`Signal at km ${signal.position} on track ${track.id} automatically set to red after train ${train.number} passed`);
         
         // Redraw the signal to reflect new state
         if (this._renderer) {
            this._renderer.redrawSignal(signal, track);
         }
      }
   }

   /**
    * Calculates the new position after moving along the rail network
    * @param currentTrack - The current track the object is on
    * @param currentKm - The current kilometer position on the track
    * @param distance - Distance to move in kilometers (positive = forward, negative = backward)
    * @returns Object with element (Track/Switch/Exit), km, and direction - element type indicates result
    * @throws MovementException for actual errors (invalid track, zero distance, etc.)
    */
   followRailNetwork(
      currentTrack: Track,
      currentKm: number,
      distance: number
   ): { element: Track | Switch | Exit; km: number; direction: number } {
      if (!currentTrack) throw new Error("currentTrack must not be null");
      let remainingDistance: number = distance;
      let track: Track | Switch | Exit | null = currentTrack;
      let km: number = currentKm;
      let currentDirection = distance > 0 ? 1 : -1;
      let nextElementAndDirection: { element: Track | Switch | Exit; direction: number } | null = null;

      while (Math.abs(remainingDistance) > 0) {
         km += remainingDistance;

         if (track instanceof Track && (km > track.length || km < 0)) {
            // We need to move to the next track
            remainingDistance = km < 0 ? km : km - track.length;

            // Find the next element through switches (may throw exception)
            nextElementAndDirection = this.findNextTrack(track, currentDirection);
            if (nextElementAndDirection == null) throw new MovementException("No next element found");
            track = nextElementAndDirection.element;
            currentDirection = nextElementAndDirection.direction;
            
            if (track instanceof Track) {               
               km = currentDirection > 0 ? 0 : track.length;
               continue;
            } else {
               break;
            }
         } else {
            break;
         }
      }

      return { element: track, km, direction: currentDirection };
   }

   /**
    * Finds the next element connected to the current track in the given direction
    * @returns Object with element (Track/Switch/Exit) and direction, or throws MovementException for dead ends
    */
   private findNextTrack(currentTrack: Track, direction: number): { element: Track | Switch | Exit; direction: number } {
      const switchIndex = direction === 1 ? 1 : 0; // 1 = end, 0 = start
      const connection = currentTrack.switches[switchIndex];

      if (!connection) {
         throw new MovementException(`Dead end encountered on track ${currentTrack.id}`);
      }

      if (connection instanceof Track) {
         return { element: connection, direction: direction };
      }

      if (connection instanceof Switch) {
         // Check if switch allows passage or blocks movement
         let newTrack: Track | null = null;
         let newDirection: number | null = null;

         if (connection.branch && connection.from) {
            // Determine which track to take based on switch state
            if (connection.branch === currentTrack) {
               newTrack = connection.from;
            } else if (connection.from === currentTrack) {
               newTrack = connection.branch;
            }

            if (newTrack) {
               newDirection = newTrack.switches[0] === connection ? 1 : -1;
               return { element: newTrack, direction: newDirection };
            }
         }

         // Switch blocks movement - return the switch itself
         return { element: connection, direction: direction };
      }

      if (connection instanceof Exit) {
         // Hit an exit - return the exit
         return { element: connection, direction: direction };
      }

      throw new MovementException(`Unknown connection type on track ${currentTrack.id}`);
   }
}

export default TrackLayoutManager;
