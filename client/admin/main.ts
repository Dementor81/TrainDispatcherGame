import "bootstrap/dist/css/bootstrap.min.css";
import "winbox/dist/winbox.bundle.min.js";
import "./main.css";
// Import Bootstrap JS and expose globally for components using window.bootstrap
import * as bootstrap from "bootstrap";
(window as any).bootstrap = bootstrap;

import AdminPanel from "./adminPanel";
import TrainsPanel from "./trainsPanel";
import OpenLinePanel from "./openLinePanel";

window.addEventListener("load", async () => {
  const panel = new AdminPanel();
  const trains = new TrainsPanel({ x: 0, y: 280 });
  const openline = new OpenLinePanel({ x: 'right', y: 280 });
  (window as any).admin = { panel, trains, openline };
});
