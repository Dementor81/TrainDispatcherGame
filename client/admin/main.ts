import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/basePanel.css";
import "./main.css";
import * as bootstrap from "bootstrap";
(window as any).bootstrap = bootstrap;

import { ensureAdminAccess } from "./loginGate";
import { AdminMenuPanel } from "./menuPanel";
import { SessionsPanel } from "./sessionsPanel";
import { LicenceKeysPanel } from "./licenceKeysPanel";
import { renderAppVersionBadge } from "../ui/appVersionBadge";

function boot(): void {
  const sessions = new SessionsPanel();
  const keys = new LicenceKeysPanel();
  const menu = new AdminMenuPanel([
    { id: "sessions", label: "Sitzungen", onSelect: () => sessions.show() },
    { id: "keys", label: "Lizenzschlüssel", onSelect: () => keys.show() },
  ]);
  (window as any).admin = { menu, sessions, keys };
}

window.addEventListener("load", () => {
  void renderAppVersionBadge();
  ensureAdminAccess(boot);
});
