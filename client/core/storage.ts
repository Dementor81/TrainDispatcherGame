import Track from "../sim/track";
import Switch from "../sim/switch";
import Signal from "../sim/signal";
import Train from "../sim/train";
import { TrackDto, SwitchDto, TrackLayoutDto } from "../network/dto";

class Storage {
    static getClassMap(): any {
        return {
           Track: Track,
           Switch: Switch,
           Signal: Signal,
           Train: Train,
        };
     }
    
    constructor() {
    }

    static loadTrackLayoutFromJson(json: string) {
        let loaded: TrackLayoutDto|null = null;
        try {
            loaded = JSON.parse(json);
        } catch (error) {
            console.error("Error parsing JSON:", error);
            return null;
        }
        if (loaded === null) {
            return null;
        }

        const tracks = loaded.tracks.map((trackObj: TrackDto) => Track.fromObject(trackObj));        
        const switches = loaded.switches.map((switchObj: SwitchDto) => Switch.fromObject(switchObj));

        tracks.forEach((track: Track) => {
            const track_loaded = loaded.tracks.find((t: TrackDto) => t.id === track.id);
            if (track_loaded === undefined) {
                throw new Error(`Track ${track.id} not found in loaded layout`);
            }
            track.switches = track_loaded.switches.map((sd: { type: string; id: number }): (Switch | Track | null) => {
                if (sd.type === "Switch") {
                    const sw = switches.find((s: Switch) => s.id === sd.id);
                    if (sw === undefined) {
                        throw new Error(`Switch ${sd.id} not found in loaded layout`);
                    }
                    return sw;
                } else if (sd.type === "Track") {
                    const tr = tracks.find((t: Track) => t.id === sd.id);
                    if (tr === undefined) {
                        throw new Error(`Track ${sd.id} not found in loaded layout`);
                    }
                    return tr;
                }
                throw new Error(`Invalid switch type: ${sd.type}`);
            });
        });

        switches.forEach((sw: any) => {
            const sw_loaded = loaded.switches.find((s: SwitchDto) => s.id === sw.id);
            if (sw_loaded === undefined) {
                throw new Error(`Switch ${sw.id} not found in loaded layout`);
            }
            sw.tracks = sw_loaded.tracks.map((id: number | null):(Track|null) => {
                if (typeof id === "number") {
                    return tracks.find((t: Track) => t.id === id) || null;
                }
                return null;
            });
            sw.branch = sw.tracks.find((t: Track) => t.id === sw_loaded.branch);
            sw.from = sw.tracks.find((t: Track) => t.id === sw_loaded.from);
        });

        
        return { tracks, switches };
    }
}

export default Storage;