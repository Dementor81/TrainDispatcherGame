import { UIManager } from "../manager/ui_manager";
import { EventManager } from "../manager/event_manager";

export class Application {
   private _uiManager: UIManager;
   private _eventManager: EventManager;

   constructor() {
      this._uiManager = new UIManager();
      this._eventManager = new EventManager();
   }

   init() {
      console.log("TrainSim Client gestartet");
      this._uiManager.init();
      this._eventManager.init();

      this._uiManager.start();
   }

   get uiManager(): UIManager {
      return this._uiManager;
   }

   get eventManager(): EventManager {
      return this._eventManager;
   }   
}

export default Application;
