import { EventManager } from "../manager/event_manager";
import { ClientSimulation } from "./clientSimulation";

/** Shared surface for full {@link Application} and lightweight hosts (e.g. game master). */
export interface ApplicationContext {
  readonly eventManager: EventManager;
  readonly clientSimulation: ClientSimulation;
}
