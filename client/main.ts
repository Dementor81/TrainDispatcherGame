import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/main.css";
import Application from "./core/application";

// Import Bootstrap JavaScript
import * as bootstrap from 'bootstrap';
// Make bootstrap available globally
(window as any).bootstrap = bootstrap;

window.addEventListener("load", async () => {
  const app = new Application();
  await app.init();
  
  // Make app globally accessible for testing
  (window as any).app = app;
});
