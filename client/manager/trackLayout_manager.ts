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


    
    
}

export default TrackLayoutManager;