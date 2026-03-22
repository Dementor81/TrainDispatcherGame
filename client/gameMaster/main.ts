import "bootstrap/dist/css/bootstrap.min.css";
import "./main.css";
// Import Bootstrap JS and expose globally for components using window.bootstrap
import * as bootstrap from "bootstrap";
(window as any).bootstrap = bootstrap;

import { GameMasterApplication } from "./gameMasterApplication";
import { HUDPanel } from "../ui/hudPanel";
import { ControlPanel } from "../ui/controlPanel";
import ScenarioSelectionDialog from "./scenarioSelectionDialog";
import TrainsPanel from "./trainsPanel";
import OpenLinePanel from "./openLinePanel";
import LogsPanel from "./logsPanel";
import PlayersPanel from "./playersPanel";
import GameCodePanel from "./gameCodePanel";
import { ensureValidSessionOrShowModal } from "../core/sessionGuard";

window.addEventListener("load", async () => {
  const validSessionCode = await ensureValidSessionOrShowModal("gmGameCode");
  if (!validSessionCode) {
    return;
  }

  const app = new GameMasterApplication();
  const hud = new HUDPanel(app as any);
  hud.show();

  const panel = new ControlPanel(app as any);
  panel.show();
  const scenario = new ScenarioSelectionDialog();
  const trains = new TrainsPanel();
  const openline = new OpenLinePanel();
  const logs = new LogsPanel();
  const players = new PlayersPanel();
  const gameCode = new GameCodePanel();

  (window as any).gameMaster = { app, hud, panel, scenario, trains, openline, logs, players, gameCode };
});
