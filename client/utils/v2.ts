type V2Like = { x: number; y: number };

export class V2 {
    private _x: number;
    private _y: number;
    private _length: number | null = null;

    static fromV2(v: V2Like): V2 {
        return new V2(v.x, v.y);
    }

    constructor(x: number, y: number);
    constructor(p: V2Like);
    constructor(xOrP: number | V2Like, y?: number) {
        if (typeof xOrP === "number" && typeof y === "number") {
            this._x = xOrP;
            this._y = y;
        } else if (typeof xOrP === "object" && xOrP !== null) {
            this._x = xOrP.x;
            this._y = xOrP.y;
        } else {
            throw new Error("Invalid arguments for V2 constructor");
        }
    }

    get x(): number {
        return this._x;
    }

    get y(): number {
        return this._y;
    }

    get length(): number {
        if (this._length == null) {
            this._length = Math.sqrt(this.x * this.x + this.y * this.y);
        }
        return this._length;
    }

    add(v: V2Like): V2 {
        return new V2(this.x + v.x, this.y + v.y);
    }

    sub(v: V2Like): V2 {
        return new V2(this.x - v.x, this.y - v.y);
    }

    multiply(s: number): V2 {
        return new V2(this.x * s, this.y * s);
    }

    unit(): V2 {
        const len = this.length;
        if (len === 0) return new V2(0, 0);
        return new V2(this.x / len, this.y / len);
    }

    dot(v: V2Like): number {
        return this.x * v.x + this.y * v.y;
    }
}

