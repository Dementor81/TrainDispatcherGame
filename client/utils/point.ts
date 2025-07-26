export class Point {
    x: number;
    y: number;

    static fromPoint(p: { x: number; y: number }): Point {
        return new Point(p.x, p.y);
    }

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    add(v: { x: number; y: number }): Point {
        return new Point(this.x + v.x, this.y + v.y);
    }

    sub(v: { x: number; y: number }): Point {
        return new Point(this.x - v.x, this.y - v.y);
    }

    equals(p: { x: number; y: number }): boolean {
        return p.x === this.x && p.y === this.y;
    }
}