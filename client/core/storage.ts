import Track from "../sim/track";
import Switch from "../sim/switch";
import Signal from "../sim/signal";
import Train from "../sim/train";
import Exit from "../sim/exit";
import { TrackDto, SwitchDto, TrackLayoutDto, ExitDto } from "../network/dto";

class Storage {
    static getClassMap(): any {
        return {
           Track: Track,
           Switch: Switch,
           Signal: Signal,
           Train: Train,
           Exit: Exit,
        };
     }
    
    constructor() {
    }

    static loadTrackLayoutFromJson(trackLayoutDto: TrackLayoutDto): {tracks: Track[], switches: Switch[], signals: Signal[]} | null {
        
        const tracks = trackLayoutDto.tracks.map((trackObj: TrackDto) => Track.fromObject(trackObj));        
        const switches = trackLayoutDto.switches.map((switchObj: SwitchDto) => Switch.fromObject(switchObj));

        tracks.forEach((track: Track) => {
            const track_loaded = trackLayoutDto.tracks.find((t: TrackDto) => t.id === track.id);
            if (track_loaded === undefined) {
                throw new Error(`Track ${track.id} not found in loaded layout`);
            }
            track.switches = track_loaded.switches.map((sd: { type: string; id: number }): (Switch | Track| Exit | null) => {
                if(sd === null) return null;
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
                else if (sd.type === "Exit") {
                    return Exit.fromObject(sd);
                }
                throw new Error(`Invalid switch type: ${sd.type}`);
            });
        });

        switches.forEach((sw: any) => {
            const sw_loaded = trackLayoutDto.switches.find((s: SwitchDto) => s.id === sw.id);
            if (sw_loaded === undefined) {
                throw new Error(`Switch ${sw.id} not found in loaded layout`);
            }
            sw.tracks = sw_loaded.tracks.map((id: number | null):(Track|null) => {
                if (typeof id === "number") {
                    const tr = tracks.find((t: Track) => t.id === id);
                    if (tr === undefined) {
                        throw new Error(`Track ${id} not found in loaded layout`);
                    }
                    return tr;
                }
                return null;
            });
            sw.branch = sw.tracks.find((t: Track) => t.id === sw_loaded.tracks[1]) || null;
            sw.from = sw.tracks.find((t: Track) => t.id === sw_loaded.tracks[0]) || null;
        });

        // Collect all signals from tracks
        const signals: Signal[] = [];
        tracks.forEach((track: Track) => {
            track.signals.forEach((signal: Signal) => {
                signals.push(signal);
            });
        });
        
        return { tracks, switches, signals };
    }
}

export default Storage;