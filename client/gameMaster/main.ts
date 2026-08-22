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
import LogsPanel from "./logsPanel";
import PlayersPanel from "./playersPanel";
import GameCodePanel from "./gameCodePanel";
import MajorEventsPanel from "./majorEventsPanel";
import { GmSnapshotPoller } from "./gmSnapshotPoller";
import { probeGmSession, showInvalidSessionModal } from "../core/sessionGuard";
import { renderAppVersionBadge } from "../ui/appVersionBadge";

function bootGmUi(): void {
  const app = new GameMasterApplication();
  const hud = new HUDPanel(app as any);
  hud.show();

  const panel = new ControlPanel(app as any);
  panel.show();
  const snapshotPoller = new GmSnapshotPoller();
  snapshotPoller.start();
  const trainEvents = new TrainEventsPanel();
  const trains = new TrainsPanel(snapshotPoller, (trainNumber) => trainEvents.showTrain(trainNumber));
  const openline = new OpenLinePanel(snapshotPoller);
  const logs = new LogsPanel();
  const players = new PlayersPanel(snapshotPoller);
  const majorEvents = new MajorEventsPanel(app, snapshotPoller, (trainNumber) => trainEvents.showTrain(trainNumber));
  const gameCode = new GameCodePanel();

  (window as any).gameMaster = { app, hud, panel, trains, trainEvents, openline, logs, players, majorEvents, gameCode, snapshotPoller };
}

window.addEventListener("load", async () => {
  void renderAppVersionBadge();

  const sessionState = await probeGmSession();
  if (sessionState === "missing-code") {
    showInvalidSessionModal();
    return;
  }

  if (sessionState === "active") {
    bootGmUi();
    return;
  }

  const pendingGameCode = (sessionStorage.getItem("gmGameCode") || "").trim();
  if (!pendingGameCode) {
    showInvalidSessionModal();
    return;
  }

  new ScenarioSelectionDialog({
    gameCode: pendingGameCode,
    onCreated: (gameCode) => {
      sessionStorage.setItem("gameCode", gameCode);
      bootGmUi();
    },
  });
});
