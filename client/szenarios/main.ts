import "bootstrap/dist/css/bootstrap.min.css";
import SzenariosApplication from "./application";

async function bootstrap() {
  const container = document.getElementById("canvas-container");
  if (!container) return;
  const app = new SzenariosApplication(container);
  await app.init();
  (window as any).szenarios = app;
}

document.addEventListener("DOMContentLoaded", () => { bootstrap(); });


