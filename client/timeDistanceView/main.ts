import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/basePanel.css";
import { fetchScenario, fetchNetwork } from "../network/api";
import { TimeDistanceDiagram } from "../timeDistanceDiagram/timeDistanceDiagram";
import { renderAppVersionBadge } from "../ui/appVersionBadge";

async function bootstrap() {
  const container = document.getElementById("canvas-container");
  if (!container) return;

  const scenarioId = new URLSearchParams(window.location.search).get("scenario");
  if (!scenarioId) {
    container.textContent = "Kein Szenario angegeben.";
    return;
  }

  const scenario = await fetchScenario(scenarioId);
  const network = await fetchNetwork(scenario.layout);

  const title = document.getElementById("scenario-title");
  if (title) title.textContent = scenario.title || scenarioId;

  const diagram = new TimeDistanceDiagram(container, {
    editable: false,
    routeSelect: document.getElementById("route-select") as HTMLSelectElement | null,
    directionFilterButton: document.getElementById("direction-filter-btn") as HTMLButtonElement | null,
  });
  await diagram.init();
  await diagram.show(scenario, network);
}

document.addEventListener("DOMContentLoaded", () => {
  void renderAppVersionBadge();
  void bootstrap();
});
