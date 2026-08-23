import { EventManager } from "../manager/event_manager";
import { ClientSimulation } from "./clientSimulation";
import type { SignalRManager } from "../network/signalr";

/** Shared surface for full {@link Application} and lightweight hosts (e.g. game master). */
export interface ApplicationContext {
  readonly eventManager: EventManager;
  readonly clientSimulation: ClientSimulation;
  readonly signalRManager: SignalRManager;
}
