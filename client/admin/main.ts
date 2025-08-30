import "bootstrap/dist/css/bootstrap.min.css";
import "winbox/dist/winbox.bundle.min.js";
import "./main.css";
// Import Bootstrap JS and expose globally for components using window.bootstrap
import * as bootstrap from "bootstrap";
(window as any).bootstrap = bootstrap;

import AdminPanel from "./adminPanel";
import TrainsPanel from "./trainsPanel";

window.addEventListener("load", async () => {
  const panel = new AdminPanel();
  await panel.update();
  setInterval(() => panel.update(), 2000);
  const trains = new TrainsPanel({ x: 0, y: 280 });
  await trains.update();
  setInterval(() => trains.update(), 2000);
  (window as any).admin = { panel, trains };
});
