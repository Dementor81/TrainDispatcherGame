import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/main.css";
import Application from "./core/application";
import { ensureValidSessionOrShowModal } from "./core/sessionGuard";
import { renderAppVersionBadge } from "./ui/appVersionBadge";

// Import Bootstrap JavaScript
import * as bootstrap from 'bootstrap';
// Make bootstrap available globally
(window as any).bootstrap = bootstrap;

// SignalR can throw "Connection closed with an error" as an unhandled rejection when
// the server closes the WebSocket with an error frame (e.g. after grace period expiry).
// The connectionPermanentlyLost event handles recovery; suppress the raw rejection so
// it doesn't surface as an uncaught runtime error overlay in development.
window.addEventListener('unhandledrejection', (event) => {
  const message = String((event.reason as any)?.message ?? event.reason ?? '');
  if (message.includes('Connection closed with an error') || message.includes('Server returned an error on close')) {
    event.preventDefault();
  }
});

window.addEventListener("load", async () => {
  void renderAppVersionBadge();

  const validSessionCode = await ensureValidSessionOrShowModal("playerGameCode");
  if (!validSessionCode) {
    return;
  }

  const app = new Application();
  await app.init();
  
  // Make app globally accessible for testing
  (window as any).app = app;
});
