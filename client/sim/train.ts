import Track from "./track";

class Train {
    private _number: string;
    private _spawnTime: Date;
    private _track: Track|null;
    private _km: number;
    private _cars:number;

    constructor(number: string, track: Track|null, km: number) {
        this._number = number;
        this._spawnTime = new Date();
        this._track = track;
        this._km = km;
        this._cars = 4;
    }

    // Static factory method to create a train from server data
    static fromServerData(data: any): Train {
        return new Train(data.trainNumber, null, 0);
    }

    // Getters
    get number(): string {
        return this._number;
    }

    get track(): Track | null {
        return this._track;
    }

    get km(): number {
        return this._km;
    }

    get spawnTime(): Date {
        return this._spawnTime;
    }

    get cars(): number {
        return this._cars;
    }

    // Set the train's position
    setPosition(track: Track, km: number): void {
        this._track = track;
        this._km = km;
    }

    // Method to get train info for debugging/logging
    getInfo(): string {
        if (this._track) {
            return `Train ${this._number} on track ${this._track.id} at km ${this._km}`;
        } else {
            return `Train ${this._number} (not positioned)`;
        }
    }
}

export default Train;