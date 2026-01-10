import { ClientSimulation } from "../core/clientSimulation";
import { EventManager } from "../manager/event_manager";
import { SignalRManager } from "../network/signalr";

export class AdminApplication {
  public eventManager: EventManager;
  public signalRManager: SignalRManager;
  public clientSimulation: ClientSimulation;

  constructor() {
    this.eventManager = new EventManager();
    this.signalRManager = new SignalRManager(this.eventManager);
    this.clientSimulation = new ClientSimulation(this.eventManager);
    
    // Connect to SignalR to receive server broadcasts
    this.connect();
  }

  private async connect(): Promise<void> {
    try {
      await this.signalRManager.connect();
      console.log('AdminApplication: Connected to SignalR');
    } catch (error) {
      console.error('AdminApplication: Failed to connect to SignalR', error);
    }
  }

  public async destroy(): Promise<void> {
    await this.signalRManager.disconnect();
  }
}
