import "bootstrap/dist/css/bootstrap.min.css";
import "./styles.css";

interface LocalFileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

interface LocalDirectoryHandle {
  kind: "directory";
  name: string;
  getDirectoryHandle(name: string): Promise<LocalDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<LocalFileHandle>;
  values(): AsyncIterableIterator<LocalFileHandle | LocalDirectoryHandle>;
}

interface Station {
  id: string;
  name: string;
  description: string;
  exits: number[];
  hasLayout: boolean;
  listed: boolean;
}

interface Connection {
  from: string;
  fromId: number;
  to: string;
  toId: number;
  distance: number;
}

interface ExistingNetwork {
  name: string;
  description: string;
  connections: Connection[];
}

const message = requiredElement<HTMLDivElement>("message");
const stationsContainer = requiredElement<HTMLDivElement>("stations");
const outputSection = requiredElement<HTMLElement>("output-section");
const output = requiredElement<HTMLTextAreaElement>("output");
const saveButton = requiredElement<HTMLButtonElement>("save");
const networkName = requiredElement<HTMLInputElement>("network-name");
const networkDescription = requiredElement<HTMLInputElement>("network-description");
const folderName = requiredElement<HTMLElement>("folder-name");
const diagramSection = requiredElement<HTMLElement>("diagram-section");
const diagramStatus = requiredElement<HTMLElement>("diagram-status");
const diagram = requiredElement<HTMLImageElement>("diagram");
const addVirtualStationButton = requiredElement<HTMLButtonElement>("add-virtual-station");

let layoutDirectory: LocalDirectoryHandle | null = null;
let stations: Station[] = [];
let generatedJson = "";
let diagramUrl = "";

requiredElement<HTMLButtonElement>("select-folder").addEventListener("click", selectFolder);
requiredElement<HTMLButtonElement>("generate").addEventListener("click", generateJson);
addVirtualStationButton.addEventListener("click", addVirtualStation);
saveButton.addEventListener("click", saveJson);

document.addEventListener("input", invalidateGeneratedJson);
document.addEventListener("change", invalidateGeneratedJson);

async function selectFolder(): Promise<void> {
  const pickDirectory = (window as Window & {
    showDirectoryPicker?: () => Promise<LocalDirectoryHandle>;
  }).showDirectoryPicker;

  if (!pickDirectory) {
    showMessage("Folder access is not supported by this browser. Use a Chromium-based browser on HTTPS or localhost.", "danger");
    return;
  }

  try {
    const directory = await pickDirectory.call(window);
    const loadedStations = await loadStations(directory);
    if (loadedStations.length === 0) {
      throw new Error("No station JSON files were found in the stations folder.");
    }
    const existingNetwork = await loadNetwork(directory, loadedStations);

    layoutDirectory = directory;
    stations = loadedStations;
    folderName.textContent = directory.name;
    networkName.value = existingNetwork?.name || directory.name;
    networkDescription.value = existingNetwork?.description ?? "";
    output.value = "";
    generatedJson = "";
    renderStations(existingNetwork?.connections ?? []);
    outputSection.classList.remove("d-none");
    addVirtualStationButton.disabled = false;
    showMessage(existingNetwork
      ? `Loaded ${stations.length} stations and ${existingNetwork.connections.length} existing connections.`
      : `Loaded ${stations.length} stations.`, "success");
    void refreshDiagram();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    showMessage(errorMessage(error), "danger");
  }
}

async function loadStations(directory: LocalDirectoryHandle): Promise<Station[]> {
  let stationsDirectory: LocalDirectoryHandle;
  try {
    stationsDirectory = await directory.getDirectoryHandle("stations");
  } catch {
    throw new Error("The selected folder does not contain a stations folder.");
  }

  const loaded: Station[] = [];
  const errors: string[] = [];

  for await (const entry of stationsDirectory.values()) {
    if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".json")) continue;

    const id = entry.name.slice(0, -5).trim().toLowerCase();
    if (!id) {
      errors.push(`${entry.name}: invalid station filename`);
      continue;
    }

    try {
      const data = JSON.parse(await (await entry.getFile()).text()) as {
        id?: unknown;
        tracks?: unknown;
      };
      if (!Array.isArray(data.tracks)) throw new Error("tracks must be an array");

      loaded.push({
        id,
        name: typeof data.id === "string" && data.id.trim() ? data.id.trim() : id,
        description: "",
        exits: extractExitIds(data.tracks),
        hasLayout: true,
        listed: true,
      });
    } catch (error) {
      errors.push(`${entry.name}: ${errorMessage(error)}`);
    }
  }

  const duplicate = loaded.find((station, index) =>
    loaded.findIndex(candidate => candidate.id === station.id) !== index);
  if (duplicate) errors.push(`Duplicate station ID: ${duplicate.id}`);
  if (errors.length > 0) throw new Error(errors.join("\n"));

  return loaded.sort((a, b) => a.id.localeCompare(b.id));
}

async function loadNetwork(directory: LocalDirectoryHandle, loadedStations: Station[]): Promise<ExistingNetwork | null> {
  let file: LocalFileHandle;
  try {
    file = await directory.getFileHandle("network.json");
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }

  const data: unknown = JSON.parse(await (await file.getFile()).text());
  if (!isRecord(data) || !Array.isArray(data.stations) || !Array.isArray(data.connections)) {
    throw new Error("network.json must contain stations and connections arrays.");
  }

  for (const entry of data.stations) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      throw new Error("network.json contains an invalid station.");
    }
    const stationId = entry.id.toLowerCase();
    let station = loadedStations.find(candidate => candidate.id === stationId);
    if (!station) {
      station = {
        id: stationId,
        name: stationId,
        description: "",
        exits: [],
        hasLayout: false,
        listed: true,
      };
      loadedStations.push(station);
    }
    if (typeof entry.name === "string" && entry.name.trim()) station.name = entry.name.trim();
    if (typeof entry.description === "string") station.description = entry.description;
  }

  const connections = data.connections.map((entry, index) =>
    parseConnection(entry, index, loadedStations));
  loadedStations.sort((a, b) => a.id.localeCompare(b.id));

  return {
    name: typeof data.name === "string" ? data.name : directory.name,
    description: typeof data.description === "string" ? data.description : "",
    connections,
  };
}

function parseConnection(value: unknown, index: number, loadedStations: Station[]): Connection {
  if (!isRecord(value) || typeof value.from !== "string" || typeof value.to !== "string" ||
      !Number.isInteger(value.fromId) || !Number.isInteger(value.toId) ||
      !Number.isInteger(value.distance) || (value.distance as number) <= 0) {
    throw new Error(`network.json connection ${index + 1} is invalid.`);
  }

  const from = value.from.toLowerCase();
  const to = value.to.toLowerCase();
  const fromId = value.fromId as number;
  const toId = value.toId as number;
  const source = getOrCreateVirtualStation(loadedStations, from);
  const destination = getOrCreateVirtualStation(loadedStations, to);

  if (source.hasLayout && !source.exits.includes(fromId) ||
      destination.hasLayout && !destination.exits.includes(toId)) {
    throw new Error(`network.json connection ${index + 1} references an unknown exit.`);
  }
  if (!source.exits.includes(fromId)) source.exits.push(fromId);
  if (!destination.exits.includes(toId)) destination.exits.push(toId);
  source.exits.sort((a, b) => a - b);
  destination.exits.sort((a, b) => a - b);

  return { from, fromId, to, toId, distance: value.distance as number };
}

function getOrCreateVirtualStation(loadedStations: Station[], id: string): Station {
  let station = loadedStations.find(candidate => candidate.id === id);
  if (!station) {
    station = {
      id,
      name: id,
      description: "",
      exits: [],
      hasLayout: false,
      listed: false,
    };
    loadedStations.push(station);
  }
  return station;
}

function extractExitIds(tracks: unknown[]): number[] {
  const ids = new Set<number>();
  for (const track of tracks) {
    if (!isRecord(track) || !Array.isArray(track.switches)) continue;
    for (const endpoint of track.switches) {
      if (isRecord(endpoint) && endpoint.type === "Exit" &&
          typeof endpoint.id === "number" && Number.isInteger(endpoint.id)) {
        ids.add(endpoint.id);
      }
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function renderStations(existingConnections: Connection[]): void {
  stationsContainer.replaceChildren();

  for (const station of stations) {
    stationsContainer.append(createStationCard(
      station,
      existingConnections.filter(connection => connection.from === station.id)));
  }
}

function createStationCard(station: Station, existingConnections: Connection[]): HTMLElement {
  const card = document.createElement("section");
  card.className = `card station-card mb-4${station.hasLayout ? "" : " virtual-station-card"}`;
  card.dataset.stationId = station.id;

  const body = document.createElement("div");
  body.className = "card-body";

  const heading = document.createElement("h2");
  heading.className = "h5";
  heading.textContent = `${station.name} (${station.id})${station.hasLayout ? "" : " — external"}`;

  const exitSummary = document.createElement("p");
  exitSummary.className = "text-secondary small";
  exitSummary.textContent = station.exits.length > 0
    ? `Exit IDs: ${station.exits.join(", ")}`
    : "No exit points found";

  const description = document.createElement("input");
  description.className = "form-control mb-3 station-description";
  description.placeholder = "Station description (optional)";
  description.value = station.description;
  description.setAttribute("aria-label", `${station.name} description`);

  const connections = document.createElement("div");
  connections.className = "connections vstack gap-3";
  for (const connection of existingConnections) {
    connections.append(createConnectionRow(station, connection));
  }

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "btn btn-sm btn-outline-primary mt-3";
  addButton.textContent = "Add connection";
  addButton.disabled = station.exits.length === 0 || stations.length < 2;
  addButton.addEventListener("click", () => connections.append(createConnectionRow(station)));

  body.append(heading, exitSummary, description, connections, addButton);
  card.append(body);
  return card;
}

function addVirtualStation(): void {
  const input = window.prompt("Virtual station ID:");
  if (input === null) return;

  const id = input.trim().toLowerCase();
  if (!id || /\s/.test(id)) {
    showMessage("The virtual station ID must not be empty or contain spaces.", "danger");
    return;
  }
  if (stations.some(station => station.id === id)) {
    showMessage(`Station '${id}' already exists.`, "danger");
    return;
  }

  const exitInput = window.prompt("Exit IDs, separated by commas (for example: 0, 1):", "0");
  if (exitInput === null) return;
  const exitParts = exitInput.split(",").map(value => value.trim());
  if (exitParts.length === 0 || exitParts.some(value => !/^\d+$/.test(value))) {
    showMessage("Enter one or more non-negative integer exit IDs.", "danger");
    return;
  }

  const station: Station = {
    id,
    name: id,
    description: "",
    exits: [...new Set(exitParts.map(Number))].sort((a, b) => a - b),
    hasLayout: false,
    listed: false,
  };
  stations.push(station);
  stations.sort((a, b) => a.id.localeCompare(b.id));

  const index = stations.indexOf(station);
  stationsContainer.insertBefore(
    createStationCard(station, []),
    stationsContainer.children[index] ?? null);
  refreshDestinationOptions();
  invalidateGeneratedJson();
  showMessage(`Virtual station '${id}' added. Connect it before saving.`, "success");
}

function refreshDestinationOptions(): void {
  for (const row of stationsContainer.querySelectorAll<HTMLElement>(".connection-row")) {
    const source = row.closest<HTMLElement>("[data-station-id]")?.dataset.stationId;
    const destination = requiredDescendant<HTMLSelectElement>(row, ".destination");
    const selected = destination.value;
    setOptions(destination, stations
      .filter(station => station.id !== source)
      .map(station => station.id));
    destination.value = selected;
    destination.dispatchEvent(new Event("change"));
  }
}

function createConnectionRow(source: Station, initial?: Connection): HTMLElement {
  const row = document.createElement("div");
  row.className = "connection-row border rounded p-3";

  const sourceExit = createSelect("Source exit", source.exits.map(String));
  sourceExit.select.classList.add("source-exit");
  if (initial) sourceExit.select.value = String(initial.fromId);

  const destinations = stations.filter(station => station.id !== source.id);
  const destination = createSelect("Destination station", destinations.map(station => station.id));
  destination.select.classList.add("destination");
  if (initial) destination.select.value = initial.to;

  const destinationExit = createSelect("Destination exit", []);
  destinationExit.select.classList.add("destination-exit");

  const updateDestinationExits = (): void => {
    const selected = stations.find(station => station.id === destination.select.value);
    setOptions(destinationExit.select, selected?.exits.map(String) ?? []);
  };
  destination.select.addEventListener("change", updateDestinationExits);
  updateDestinationExits();
  if (initial) destinationExit.select.value = String(initial.toId);

  const distanceGroup = document.createElement("div");
  const distanceLabel = document.createElement("label");
  distanceLabel.className = "form-label";
  distanceLabel.textContent = "Distance (m)";
  const distance = document.createElement("input");
  distance.className = "form-control distance";
  distance.type = "number";
  distance.min = "1";
  distance.step = "1";
  distance.value = initial ? String(initial.distance) : "";
  distanceGroup.append(distanceLabel, distance);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn btn-outline-danger";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    row.remove();
    invalidateGeneratedJson();
  });

  row.append(sourceExit.group, destination.group, destinationExit.group, distanceGroup, remove);
  return row;
}

function generateJson(): void {
  try {
    const name = networkName.value.trim();
    if (!name) throw new Error("Network name is required.");

    const connections: Connection[] = [];
    const usedSources = new Set<string>();

    for (const stationCard of stationsContainer.querySelectorAll<HTMLElement>("[data-station-id]")) {
      const source = stationCard.dataset.stationId!;
      const station = stations.find(candidate => candidate.id === source)!;
      station.description = requiredDescendant<HTMLInputElement>(stationCard, ".station-description").value.trim();

      for (const row of stationCard.querySelectorAll<HTMLElement>(".connection-row")) {
        const fromId = readInteger(row, ".source-exit", "source exit");
        const to = requiredDescendant<HTMLSelectElement>(row, ".destination").value;
        const toId = readInteger(row, ".destination-exit", "destination exit");
        const distance = readInteger(row, ".distance", "distance");

        if (to === source) throw new Error(`${source}: self-connections are not allowed.`);
        if (distance <= 0) throw new Error(`${source}: distance must be a positive integer.`);
        if (!station.exits.includes(fromId)) throw new Error(`${source}: exit ${fromId} does not exist.`);
        if (!stations.find(candidate => candidate.id === to)?.exits.includes(toId)) {
          throw new Error(`${to}: exit ${toId} does not exist.`);
        }

        const sourceKey = `${source}:${fromId}`;
        if (usedSources.has(sourceKey)) {
          throw new Error(`${source}: exit ${fromId} is used by more than one connection.`);
        }
        usedSources.add(sourceKey);
        connections.push({ from: source, fromId, to, toId, distance });
      }
    }

    generatedJson = JSON.stringify({
      name,
      description: networkDescription.value.trim(),
      stations: stations.filter(station => station.listed).map(station => ({
        id: station.id,
        name: station.name,
        description: station.description,
      })),
      connections,
    }, null, 3);

    output.value = generatedJson;
    saveButton.disabled = false;
    showMessage("network.json generated.", "success");
  } catch (error) {
    generatedJson = "";
    saveButton.disabled = true;
    showMessage(errorMessage(error), "danger");
  }
}

async function saveJson(): Promise<void> {
  if (!layoutDirectory || !generatedJson) return;

  try {
    let exists = true;
    try {
      await layoutDirectory.getFileHandle("network.json");
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") exists = false;
      else throw error;
    }

    if (exists && !window.confirm("network.json already exists. Replace it?")) return;

    const file = await layoutDirectory.getFileHandle("network.json", { create: true });
    const writable = await file.createWritable();
    await writable.write(`${generatedJson}\n`);
    await writable.close();
    showMessage("network.json saved.", "success");
    await refreshDiagram();
  } catch (error) {
    showMessage(`Could not save network.json: ${errorMessage(error)}`, "danger");
  }
}

async function refreshDiagram(): Promise<void> {
  if (!layoutDirectory) return;

  diagramSection.classList.remove("d-none");
  diagram.classList.add("d-none");
  diagramStatus.textContent = "Generating diagram on the server…";

  try {
    const response = await fetch(
      `/api/network/${encodeURIComponent(layoutDirectory.name)}/diagram.svg?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error("The selected folder name does not match a layout in the server data directory.");
    }

    if (diagramUrl) URL.revokeObjectURL(diagramUrl);
    diagramUrl = URL.createObjectURL(await response.blob());
    diagram.src = diagramUrl;
    diagram.classList.remove("d-none");
    diagramStatus.textContent = "Generated from the server copy of network.json.";
  } catch (error) {
    diagramStatus.textContent = `Preview unavailable: ${errorMessage(error)}`;
  }
}

function createSelect(label: string, options: string[]): { group: HTMLElement; select: HTMLSelectElement } {
  const group = document.createElement("div");
  const labelElement = document.createElement("label");
  labelElement.className = "form-label";
  labelElement.textContent = label;
  const select = document.createElement("select");
  select.className = "form-select";
  setOptions(select, options);
  group.append(labelElement, select);
  return { group, select };
}

function setOptions(select: HTMLSelectElement, values: string[]): void {
  select.replaceChildren(...values.map(value => new Option(value, value)));
  select.disabled = values.length === 0;
}

function readInteger(container: ParentNode, selector: string, label: string): number {
  const value = requiredDescendant<HTMLInputElement | HTMLSelectElement>(container, selector).value;
  const number = Number(value);
  if (!value || !Number.isInteger(number)) throw new Error(`Every connection needs a valid ${label}.`);
  return number;
}

function invalidateGeneratedJson(): void {
  if (!generatedJson) return;
  generatedJson = "";
  saveButton.disabled = true;
}

function showMessage(text: string, type: "success" | "danger"): void {
  message.textContent = text;
  message.className = `alert alert-${type}`;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function requiredDescendant<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
