import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/basePanel.css";
import "./main.css";
// Import Bootstrap JS and expose globally for components using window.bootstrap
import * as bootstrap from "bootstrap";
(window as any).bootstrap = bootstrap;

import { GameMasterApplication } from "./gameMasterApplication";
import { HUDPanel } from "../ui/hudPanel";
import { TIME_DISTANCE_MENU_ITEM, HudMenuItem } from "../ui/hudMenu";
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
import { handleSessionEnded, probeGmSession, showInvalidSessionModal } from "../core/sessionGuard";
import { renderAppVersionBadge } from "../ui/appVersionBadge";
import { endGameSession } from "../network/api";
import Toast from "../ui/toast";
import type { BasePanel } from "../ui/basePanel";

function bootGmUi(): void {
  const app = new GameMasterApplication();
  const hud = new HUDPanel(app);
  hud.show();

  const panel = new ControlPanel(app);
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

  hud.setMenuItems(() => buildGmMenuItems([
    { label: "Alle Züge", panel: trains },
    { label: "Offene Strecken", panel: openline },
    { label: "Nachrichten", panel: logs },
    { label: "Alle Spieler", panel: players },
    { label: "Störungen", panel: majorEvents },
    { label: "Game-Code", panel: gameCode },
  ]));

  (window as any).gameMaster = { app, hud, panel, trains, trainEvents, openline, logs, players, majorEvents, gameCode, snapshotPoller };
}

function buildGmMenuItems(windows: { label: string; panel: BasePanel }[]): HudMenuItem[] {
  return [
    {
      id: "end-session",
      label: "Sitzung beenden",
      icon: "bi-power",
      onSelect: () => {
        void endServerSession();
      },
    },
    TIME_DISTANCE_MENU_ITEM,
    {
      id: "windows",
      label: "Fenster",
      icon: "bi-window-stack",
      children: windows.map((entry) => ({
        id: `window-${entry.label}`,
        label: entry.label,
        onSelect: () => entry.panel.show(),
      })),
    },
  ];
}

async function endServerSession(): Promise<void> {
  if (!window.confirm("Sitzung wirklich beenden? Alle Spieler werden getrennt.")) {
    return;
  }

  try {
    await endGameSession();
    handleSessionEnded({ redirectImmediately: true });
  } catch (error) {
    console.error("Failed to end game session", error);
    Toast.show("Sitzung konnte nicht beendet werden.", "error");
  }
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
