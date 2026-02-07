import "bootstrap/dist/css/bootstrap.min.css";
import "./main.css";
// Import Bootstrap JS and expose globally for components using window.bootstrap
import * as bootstrap from "bootstrap";
(window as any).bootstrap = bootstrap;

import { AdminApplication } from "./adminApplication";
import { HUDPanel } from "../ui/hudPanel";
import { ControlPanel } from "../ui/controlPanel";
import ScenarioPanel from "./scenarioPanel";
import TrainsPanel from "./trainsPanel";
import OpenLinePanel from "./openLinePanel";
import LogsPanel from "./logsPanel";
import PlayersPanel from "./playersPanel";

window.addEventListener("load", async () => {
  const app = new AdminApplication();
  const hud = new HUDPanel(app as any);
  hud.show();
  
  const panel = new ControlPanel(app as any);
  panel.show();
  const scenario = new ScenarioPanel();
  const trains = new TrainsPanel();
  const openline = new OpenLinePanel();
  const logs = new LogsPanel();
  const players = new PlayersPanel();
  

  (window as any).admin = { app, hud, panel, scenario, trains, openline, logs, players };
});
