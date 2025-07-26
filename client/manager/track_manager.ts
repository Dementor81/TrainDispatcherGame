import Track from "../sim/track";
import Switch from "../sim/switch";

export class TrackManager {
    private _tracks: Track[] = [];
    private _switches: Switch[] = [];

    constructor() {
        this._tracks = [];
        this._switches = [];
    }

    get tracks(): Track[] {
        return this._tracks;
    }

    get switches(): Switch[] {
        return this._switches;
    }
    
    
    
    
}

export default TrackManager;