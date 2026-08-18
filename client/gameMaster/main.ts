import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/basePanel.css";
import "./main.css";
// Import Bootstrap JS and expose globally for components using window.bootstrap
import * as bootstrap from "bootstrap";
(window as any).bootstrap = bootstrap;

import { GameMasterApplication } from "./gameMasterApplication";
import { HUDPanel } from "../ui/hudPanel";
import { ControlPanel } from "../ui/controlPanel";
import ScenarioSelectionDialog from "./scenarioSelectionDialog";
import TrainsPanel from "./trainsPanel";
import TrainEventsPanel from "./trainEventsPanel";
import OpenLinePanel from "./openLinePanel";
import BlockedExitsPanel from "./blockedExitsPanel";
import LogsPanel from "./logsPanel";
import PlayersPanel from "./playersPanel";
import GameCodePanel from "./gameCodePanel";
import { GmSnapshotPoller } from "./gmSnapshotPoller";
import { ensureValidSessionOrShowModal } from "../core/sessionGuard";
import { renderAppVersionBadge } from "../ui/appVersionBadge";

window.addEventListener("load", async () => {
  void renderAppVersionBadge();

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
  const snapshotPoller = new GmSnapshotPoller();
  snapshotPoller.start();
  const trainEvents = new TrainEventsPanel();
  const trains = new TrainsPanel(snapshotPoller, (trainNumber) => trainEvents.showTrain(trainNumber));
  const openline = new OpenLinePanel(snapshotPoller);
  const blockedExits = new BlockedExitsPanel(app);
  const logs = new LogsPanel();
  const players = new PlayersPanel(snapshotPoller);
  const gameCode = new GameCodePanel();

  (window as any).gameMaster = { app, hud, panel, scenario, trains, trainEvents, openline, blockedExits, logs, players, gameCode, snapshotPoller };
});

