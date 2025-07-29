import Track from "../sim/track";
import Switch from "../sim/switch";
import Exit from "../sim/exit";
import api from "../network/api";
import Storage from "../core/storage";
import { Renderer } from "../canvas/renderer";
import { Application } from "../core/application";

export class TrackLayoutManager {
    private _tracks: Track[] = [];
    private _switches: Switch[] = [];
    private _exits: Exit[] = [];
    private _renderer: Renderer | null = null;
    private _onLayoutLoaded: (() => void) | null = null;
    private _application: Application;

    constructor(application: Application) {
        this._tracks = [];
        this._switches = [];
        this._exits = [];
        this._application = application;
    }

    setRenderer(renderer: Renderer): void {
        this._renderer = renderer;

        this._application.eventManager.on('switchClicked', (sw: Switch) => {
            console.log(`Switch ${sw.id} clicked`);
            this.handleSwitchClick(sw);
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

    // Find the track and kilometer position for an exit point
    getExitPointLocation(exitPointId: string): { track: Track | null, km: number } {
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
        const exit = this._exits.find(e => e.id === exitId);
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
            const trackLayout: {tracks: Track[], switches: Switch[], exits: Exit[]} | null = Storage.loadTrackLayoutFromJson(trackLayoutDto);
            if (trackLayout === null) {
                console.error("Failed to load track layout");
                return;
            }
            this._tracks = trackLayout.tracks;
            this._switches = trackLayout.switches;
            this._exits = trackLayout.exits;
            console.log("Track layout loaded:", this._tracks.length, "tracks,", this._switches.length, "switches,", this._exits.length, "exits");
            
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

    /**
     * Calculates the new position after moving along the rail network
     * @param currentTrack - The current track the object is on
     * @param currentKm - The current kilometer position on the track
     * @param direction - Movement direction: 1 for forward (start to end), -1 for backward (end to start)
     * @param distance - Distance to move in kilometers
     * @returns New position with track, km, and direction, or null if movement is blocked
     */
    calculateMovement(currentTrack: Track, currentKm: number, direction: number, distance: number): { track: Track, km: number, direction: number } | null {
        if (!currentTrack || distance <= 0) {
            return null;
        }

        let remainingDistance = distance;
        let track = currentTrack;
        let km = currentKm;
        let dir = direction;

        while (remainingDistance > 0) {
            // Calculate how far we can move on the current track
            let distanceToEnd: number;
            if (dir === 1) {
                // Moving forward (start to end)
                distanceToEnd = track.length - km;
            } else {
                // Moving backward (end to start)
                distanceToEnd = km;
            }

            if (distanceToEnd >= remainingDistance) {
                // We can complete the movement on this track
                if (dir === 1) {
                    km += remainingDistance;
                } else {
                    km -= remainingDistance;
                }
                remainingDistance = 0;
            } else {
                // We need to move to the next track
                remainingDistance -= distanceToEnd;
                
                // Move to the end/start of current track
                if (dir === 1) {
                    km = track.length;
                } else {
                    km = 0;
                }

                // Find the next track through switches
                const nextTrackAndDirection = this.findNextTrack(track, dir);
                if (!nextTrackAndDirection) {
                    // Movement is blocked (hit an exit or dead end)
                    return null;
                }

                track = nextTrackAndDirection.track;
                dir = nextTrackAndDirection.direction;
                
                // Set km to the appropriate end of the new track
                if (dir === 1) {
                    km = 0;
                } else {
                    km = track.length;
                }
            }
        }

        return { track, km, direction: dir };
    }

    /**
     * Finds the next track connected to the current track in the given direction
     */
    private findNextTrack(currentTrack: Track, direction: number): {track: Track, direction: number} | null {
        const switchIndex = direction === 1 ? 1 : 0; // 1 = end, 0 = start
        const connection = currentTrack.switches[switchIndex];
        
        if (!connection) {
            return null;
        }
        
        if (connection instanceof Track) {
            return {track: connection, direction: direction};
        }
        
        if (connection instanceof Switch) {
            let newTrack: Track | null = null;
            let newDirection: number | null = null;
            // Get the coordinates of the connection point of currentTrack with the switch
            const coordinates = switchIndex === 0 ? currentTrack.start : currentTrack.end;
            // Follow the switch's current state
            if (connection.branch && connection.from) {
                // Determine which track to take based on switch state
                if(connection.branch === currentTrack) {
                    newTrack = connection.from;
                } else if (connection.from === currentTrack) {
                    newTrack = connection.branch;
                }
                else
                    return null;
                newDirection = newTrack.switches[0] === connection ? 1 : -1;
            }
            if (newTrack && newDirection) {
                return {track: newTrack, direction: newDirection};
            }
            return null;
        }

        if (connection instanceof Exit) {
            // Hit an exit - movement stops
            return null;
        }

        return null;
    }



}

export default TrackLayoutManager;