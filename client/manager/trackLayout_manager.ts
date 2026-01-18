import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import Signal from "../sim/signal";
import Train from "../sim/train";
import api from "../network/api";
import Storage from "../core/storage";
import { Renderer } from "../canvas/renderer";
import { Application } from "../core/application";
import { NetworkConnectionDto, PlatformDto } from "../network/dto";
import { CancellableEvent } from "./event_manager";

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
   private _signals: Signal[] = [];
   private _platforms: PlatformDto[] = [];
   private _layoutId: string = "";
   private _renderer: Renderer | null = null;
   private _onLayoutLoaded: (() => void) | null = null;
   private _application: Application;
   private _connections: NetworkConnectionDto[] = [];

   constructor(application: Application) {
      this._tracks = [];
      this._switches = [];
      this._signals = [];
      this._platforms = [];
      this._application = application;
   }

   setRenderer(renderer: Renderer): void {
      this._renderer = renderer;

      this._application.eventManager.on("switchClicked", (sw: Switch) => {
         console.log(`Switch ${sw.id} clicked`);
         this.handleSwitchClick(sw);
      });

      this._application.eventManager.on("signalClicked", (event: CancellableEvent, signal: Signal) => {
         console.log(`Signal at km ${signal.position} on track ${signal.track?.id} clicked`);
         this.handleSignalClick(event, signal);
      });

      this._application.eventManager.on("trainPassedSignal", (train: Train, signal: Signal) => {
         console.log(`Train ${train.number} passed signal at km ${signal.position} on track ${signal.track?.id}`);
         this.handleTrainPassedSignal(train, signal);
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

   get signals(): Signal[] {
      return this._signals;
   }

   get layoutId(): string {
      return this._layoutId;
   }

   get platforms(): PlatformDto[] {
      return this._platforms;
   }

   // Find the track and kilometer position for an exit point
   getExitPointLocation(exitPointId: number): { track: Track | null; km: number } {
      const exitId = exitPointId;

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

   getExitPointDirection(exitPointId: number): number {
      // If exit is at the start of the track (index 0), direction is positive (1)
      // If exit is at the end of the track (index 1), direction is negative (-1)
      const exitId = exitPointId;
      for (const track of this._tracks) {
         for (let i = 0; i < track.switches.length; i++) {
            const switchItem = track.switches[i];
            if (switchItem instanceof Exit && switchItem.id === exitId) {
               return i === 0 ? 1 : -1;
            }
         }
      }
      throw new Error(`Exit point ${exitPointId} not found in track layout`);
   }

   getExitById(exitPointId: number): Exit | null {
      for (const track of this._tracks) {
         for (const switchItem of track.switches) {
            if (switchItem instanceof Exit && switchItem.id === exitPointId) {
               return switchItem;
            }
         }
      }
      return null;
   }

   async loadTrackLayout(layoutID: string): Promise<void> {
      console.log("Loading track layout:", layoutID);
      try {
         const trackLayoutDto = await api.fetchLayout(layoutID);
         const trackLayout: { tracks: Track[]; switches: Switch[]; signals: Signal[] } | null =
            Storage.loadTrackLayoutFromJson(trackLayoutDto);
         if (trackLayout === null) {
            console.error("Failed to load track layout");
            return;
         }
      this._tracks = trackLayout.tracks;
      this._switches = trackLayout.switches;
      this._signals = trackLayout.signals;
      this._layoutId = trackLayoutDto.id;
      this._connections = trackLayoutDto.connections || [];
      this._platforms = trackLayoutDto.platforms || [];

      // Assign connections to exit points
      this.assignConnectionsToExits();

      // Notify that layout is loaded
      if (this._onLayoutLoaded) {
         this._onLayoutLoaded();
      }
      } catch (error) {
         console.error("Failed to load track layout:", error);
      }
   }

   private assignConnectionsToExits(): void {
      // Find all exit points in the track layout
      for (const track of this._tracks) {
         for (const switchItem of track.switches) {
            if (switchItem instanceof Exit) {
               const exitId = switchItem.id;
               
               // Search for corresponding connection
               const connection = this._connections.find(
                  (conn) => 
                     (conn.from === this._layoutId && conn.fromId === exitId) ||
                     (conn.to === this._layoutId && conn.toId === exitId)
               );

               if (connection) {
                  switchItem.connection = connection;
                  
                  // Determine if exit is inbound or outbound
                  const isInbound = connection.to === this._layoutId && connection.toId === exitId;
                  switchItem.isInbound = isInbound;
                  
                  console.log(
                     `Exit ${exitId}: ${isInbound ? 'Inbound from' : 'Outbound to'} ` +
                     `${isInbound ? connection.from : connection.to}`
                  );
               } else {
                  console.warn(`No connection found for exit ${exitId}`);
               }
            }
         }
      }
   }

   private handleSwitchClick(sw: Switch): void {
      sw.toggle();
   }

   private handleSignalClick(event: CancellableEvent, signal: Signal): void {
      // Check if default action was prevented (e.g., route validation failed)
      if (event.defaultPrevented) {
         return;
      }
      
      // Toggle signal state
      signal.state = !signal.state;
      console.log(`Signal at km ${signal.position} on track ${signal.track?.id} changed to ${signal.state ? 'green' : 'red'}`);
      
      // Redraw the signal to reflect new state
      if (this._renderer) {
         this._renderer.redrawSignal(signal);
      }
      
      // Emit event that signal state changed
      this._application.eventManager.emit('signalStateChanged', signal);
   }

   private handleTrainPassedSignal(train: Train, signal: Signal): void {
      // Automatically set signal to red (stop) after train passes
      if (signal.state) {
         signal.state = false; // Set to red
         console.log(`Signal at km ${signal.position} on track ${signal.track?.id} automatically set to red after train ${train.number} passed`);
         
         // Redraw the signal to reflect new state
         if (this._renderer) {
            this._renderer.redrawSignal(signal);
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
      
      while (Math.abs(remainingDistance) > 0) {
         km += remainingDistance;

         if (track instanceof Track && (km > track.length || km < 0)) {
            // We need to move to the next track
            remainingDistance = km < 0 ? km : km - track.length;

            // Find the next element through switches (may throw exception)
            track = this.findNextTrack(track, currentDirection);
            
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
    * Finds the next signal on a track in the given direction from a certain point
    * @param currentTrack - The current track to search on
    * @param currentKm - The current kilometer position on the track
    * @param direction - Direction to search (1 = forward, -1 = backward)
    * @returns The next signal in the given direction, or null if no signal found
    */
   /**
    * Finds the next signal on a track in the given direction from a certain point.
    * @param currentTrack - The current track to search on
    * @param currentKm - The current kilometer position on the track
    * @param direction - Direction to search (1 = forward, -1 = backward)
    * @param onlyCurrentTrack - If true, restrict search to current track only (default: false)
    * @returns The next signal in the given direction, or null if no signal found
    */
   getNextSignal(
      currentTrack: Track, 
      currentKm: number, 
      direction: number,
      onlyCurrentTrack: boolean = false
   ): Signal | null {
      if (!currentTrack) return null;

      // First, check for signals on the current track
      const currentTrackSignals = currentTrack.signals.filter(signal => {
         if (signal.direction !== direction) return false;
         
         if (direction > 0) {
            // Moving forward: look for signals ahead
            return signal.position > currentKm;
         } else {
            // Moving backward: look for signals behind
            return signal.position < currentKm;
         }
      });

      if (currentTrackSignals.length > 0) {
         // Return the closest signal in the direction of travel
         if (direction > 0) {
            return currentTrackSignals.reduce((closest, signal) => 
               signal.position < closest.position ? signal : closest
            );
         } else {
            return currentTrackSignals.reduce((closest, signal) => 
               signal.position > closest.position ? signal : closest
            );
         }
      }

      // If only looking for signals on current track, return null if not found
      if (onlyCurrentTrack) {
         return null;
      }

      // If no signals on current track, check the next track
      try {
         const nextElement = this.findNextTrack(currentTrack, direction);
         if (nextElement instanceof Track) {
            const nextTrack = nextElement;
            const startKm = direction > 0 ? 0 : nextTrack.length;
            
            // Look for signals on the next track
            const nextTrackSignals = nextTrack.signals.filter(signal => {
               if (signal.direction !== direction) return false;
               
               if (direction > 0) {
                  // Moving forward: look for signals from start of track
                  return signal.position >= startKm;
               } else {
                  // Moving backward: look for signals from end of track
                  return signal.position <= startKm;
               }
            });

            if (nextTrackSignals.length > 0) {
               // Return the closest signal in the direction of travel
               if (direction > 0) {
                  return nextTrackSignals.reduce((closest, signal) => 
                     signal.position < closest.position ? signal : closest
                  );
               } else {
                  return nextTrackSignals.reduce((closest, signal) => 
                     signal.position > closest.position ? signal : closest
                  );
               }
            }
         }
      } catch (error) {
         // If we can't find the next track (dead end), no signals to worry about
         console.log(`No next track found for signal search: ${error}`);
      }

      return null; // No signals found
   }

   /**
    * Finds the next element connected to the current track in the given direction
    * @returns The next element (Track/Switch/Exit), or throws MovementException for dead ends
    */
   findNextTrack(currentTrack: Track, direction: number): Track | Switch | Exit {
      const switchIndex = direction === 1 ? 1 : 0; // 1 = end, 0 = start
      const connection = currentTrack.switches[switchIndex];

      if (!connection) {
         throw new MovementException(`Dead end encountered on track ${currentTrack.id}`);
      }

      if (connection instanceof Track) {
         return connection;
      }

      if (connection instanceof Switch) {
         // Check if switch allows passage or blocks movement
         let newTrack: Track | null = null;

         if (connection.branch && connection.from) {
            // Determine which track to take based on switch state
            if (connection.branch === currentTrack) {
               newTrack = connection.from;
            } else if (connection.from === currentTrack) {
               newTrack = connection.branch;
            }

            if (newTrack) {
               return newTrack;
            }
         }

         // Switch blocks movement - return the switch itself
         return connection;
      }

      if (connection instanceof Exit) {
         // Hit an exit - return the exit
         return connection;
      }

      throw new MovementException(`Unknown connection type on track ${currentTrack.id}`);
   }


}

export default TrackLayoutManager;
