import BaseSimModule from "./base";
import { Point } from "../utils/point";
import { NetworkConnectionDto } from "../network/dto";

class Exit extends BaseSimModule {
   
   static fromObject(object: any): Exit {
      const exit = new Exit();
      exit._id = object.id;
      return exit;
   }

   //--------------------------------

   private _id: number = 0;
   private _connection: NetworkConnectionDto | null = null;
   private _isInbound: boolean = false;

   constructor() {
      super();
      this._id = -1;
   }

   get id(): number {
      return this._id;
   }

   get connection(): NetworkConnectionDto | null {
      return this._connection;
   }

   set connection(conn: NetworkConnectionDto | null) {
      this._connection = conn;
   }

   get isInbound(): boolean {
      return this._isInbound;
   }

   set isInbound(value: boolean) {
      this._isInbound = value;
   }

   fromObject(object: any) {
      this._id = object.id;
   }
}

export default Exit; 