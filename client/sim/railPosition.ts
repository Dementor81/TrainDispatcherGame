import Track from "./track";

class RailPosition {
    private _track: Track;
    private _km: number;

    constructor(track: Track, km: number) {
        this._track = track;
        this._km = km;
    }

    get track(): Track {
        return this._track;
    }

    get km(): number {
        return this._km;
    }
    set km(km: number) {
        this._km = km;
    }

    set track(track: Track) {
        this._track = track;
    }
}

export default RailPosition;