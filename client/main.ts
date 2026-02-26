import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/main.css";
import Application from "./core/application";
import { ensureValidSessionOrShowModal } from "./core/sessionGuard";

// Import Bootstrap JavaScript
import * as bootstrap from 'bootstrap';
// Make bootstrap available globally
(window as any).bootstrap = bootstrap;

window.addEventListener("load", async () => {
  const validSessionCode = await ensureValidSessionOrShowModal();
  if (!validSessionCode) {
    return;
  }

  const app = new Application();
  await app.init();
  
  // Make app globally accessible for testing
  (window as any).app = app;
});
