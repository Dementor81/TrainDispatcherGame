import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/basePanel.css";
import { ensureAdminAccess } from "../admin/loginGate";
import SzenariosApplication from "./application";
import { renderAppVersionBadge } from "../ui/appVersionBadge";

async function bootstrap() {
  const container = document.getElementById("canvas-container");
  if (!container) return;
  const app = new SzenariosApplication(container);
  await app.init();
  (window as any).szenarios = app;
}

document.addEventListener("DOMContentLoaded", () => {
  void renderAppVersionBadge();
  const appEl = document.getElementById("app");
  if (appEl) {
    appEl.hidden = true;
  }
  ensureAdminAccess(() => {
    if (appEl) {
      appEl.hidden = false;
    }
    void bootstrap();
  });
});


