import BaseSimModule from "./base";
import { Point } from "../utils/point";
import { V2 } from "../utils/v2";
import Signal from "./signal";
import Switch from "./switch";
import Exit from "./exit";

class Track extends BaseSimModule {
   static fromObject(object: any): Track {
      const track = new Track();
      track._start = new Point(object.start.x, object.start.y);
      track._end = new Point(object.end.x, object.end.y);
      track._id = object.id;
      track._signals = object.signals ? object.signals.map((signalObj: any) => Signal.fromObject(signalObj)) : [];
      track._switches = [null, null];
      track._halt = object.halt;
      return track;
   }

   //--------------------------------

   private _start: Point;
   private _end: Point;
   private _signals: Signal[];
   private _halt: boolean;
   private _switches: (Switch | Track | Exit | null)[];
   private _id: number = 0;

   private _vector: V2 | null = null;
   private _rad: number | null = null;
   private _deg: number | null = null;
   private _length: number | null = null;
   private _unit: V2 | null = null;
   private _slope: number | null = null;
   private _sin: number | null = null;
   private _cos: number | null = null;

   constructor() {
      super();
      this._start = new Point(0, 0);
      this._end = new Point(0, 0);
      this._id = -1;
      this._signals = [];
      this._switches = [null, null];
      this._halt = false;
   }

   get id(): number {
      return this._id;
   }

   get start(): Point {
      return this._start;
   }

   get end(): Point {
      return this._end;
   }

   get signals(): Signal[] {
      return this._signals;
   }

   get switches(): (Switch | Track | Exit | null)[] {
      return this._switches;
   }

   set switches(switches: (Switch | Track | Exit | null)[]) {
      this._switches = switches;
   }

   get vector() {
      if (!this._vector) {
         this._vector = new V2(this._end.x - this._start.x, this._end.y - this._start.y);
      }
      return this._vector;
   }

   get rad() {
      if (!this._rad) this._rad = Math.atan2(this.vector.y, this.vector.x);
      return this._rad;
   }

   get deg() {
      if (!this._deg) this._deg = this.rad * (180 / Math.PI);
      return this._deg;
   }

   get length() {
      if (!this._length) this._length = this.vector.length;
      return this._length;
   }

   get unit() {
      if (!this._unit) this._unit = this.vector.unit();
      return this._unit;
   }

   get slope() {
      return this._slope ? this._slope : (this._slope = this.vector.y / this.vector.x);
   }

   get sin() {
      if (!this._sin) this._sin = Math.sin(this.rad);
      return this._sin;
   }

   get cos() {
      if (!this._cos) this._cos = Math.cos(this.rad);
      return this._cos;
   }

   get halt(): boolean {
      return this._halt;
   }

   private resetCache() {
      this._vector = null;
      this._rad = null;
      this._deg = null;
      this._length = null;
      this._unit = null;
      this._slope = null;
      this._sin = null;
      this._cos = null;
   }

   along(point: Point, km: number): Point {
      if (point.equals(this.end)) {
         return this.end.add(this.unit.multiply(-km));
      } else {
         return this.start.add(this.unit.multiply(km));
      }
   }
}

export default Track;
