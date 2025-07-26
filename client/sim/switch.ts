import { Point } from "../utils/point";
import Track from "./track";

class Switch {
   private static _counter = 0;

   static _getID() {
      return Switch._counter++;
   }

   static fromObject(object: any): Switch {
    const sw = new Switch(new Point(object.location.x, object.location.y));
    sw._id = object.id;
    sw._tracks = new Array(4).fill(null);
    sw._branch = null;
    sw._from = null;
    return sw;
 }

   //--------------------------------

   private _id: number;
   private _location: Point;
   private _tracks: Track[];
   private _branch: Track | null;
   private _from: Track | null;

   constructor(location: Point) {
      this._id = Switch._getID();      
      this._location = location;
      this._tracks = new Array(4).fill(null);
      this._branch = null;
      this._from = null;
   }

   get id(): number {
      return this._id;
   }

   get location(): Point {
      return this._location;
   }

   get track1(): Track {
      return this._tracks[0];
   }

   get track2(): Track {
      return this._tracks[1];
   }

   get track3(): Track {
      return this._tracks[2];
   }

   get track4(): Track {
      return this._tracks[3];
   }

   get branch(): Track | null {
      return this._branch;
   }

   get from(): Track | null {
      return this._from;
   }

   set branch(track: Track | null) {
      this._branch = track;
   }

   set from(track: Track | null) {
      this._from = track;
   }

   get tracks(): Track[] {
      return this._tracks;
   }

   
}

export default Switch;