import BaseSimModule from "./base";
import { Point } from "../utils/point";

class Exit extends BaseSimModule {
   
   static fromObject(object: any): Exit {
      const exit = new Exit();
      exit._id = object.id;
      exit._destination = object.destination;
      return exit;
   }

   //--------------------------------

   private _id: number = 0;
   private _destination: string = "";

   constructor() {
      super();
      this._id = -1;
      this._destination = "";
   }

   get id(): number {
      return this._id;
   }

   get destination(): string {
      return this._destination;
   }

   set destination(destination: string) {
      this._destination = destination;
   }

   fromObject(object: any) {
      this._id = object.id;
      this._destination = object.destination;
   }
}

export default Exit; 