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