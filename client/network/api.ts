import { TrackLayoutDto, StationTimetableEventDto, ScenarioSummaryDto, ScenarioDto, NetworkDto, TrainWayPointDto, TrainDetailsDto, TrainEventDto, LogEntryDto, PlayerControlledStationDto, GameMasterSnapshotDto } from "./dto";

const API_BASE_URL = "/api";

function getGameCode(): string {
  const stored = sessionStorage.getItem("gameCode")?.trim();
  if (!stored) {
    throw new Error("Missing game code in session storage.");
  }

  return stored;
}

function withGameCode(path: string): string {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("gameCode", getGameCode());
  return url.toString();
}

export interface StationInfo {
  id: string;
  name: string;
  description: string;
}

export async function fetchAvailableStations(): Promise<StationInfo[]> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/layouts`));
  if (!response.ok) {
    throw new Error(`Failed to fetch station list: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchLayout(name: string): Promise<TrackLayoutDto> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/layouts/${encodeURIComponent(name)}`));
  if (!response.ok) {
    throw new Error(`Failed to fetch layout "${name}": ${response.statusText}`);
  }
  return response.json();
}

// Simulation control API functions
export async function startSimulation(): Promise<any> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/simulation/start`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to start simulation: ${response.statusText}`);
  }
  return response.json();
}

export async function stopSimulation(): Promise<any> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/simulation/stop`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to stop simulation: ${response.statusText}`);
  }
  return response.json();
}

export async function pauseSimulation(): Promise<any> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/simulation/pause`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to pause simulation: ${response.statusText}`);
  }
  return response.json();
}

export async function resumeSimulation(): Promise<any> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/simulation/resume`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to resume simulation: ${response.statusText}`);
  }
  return response.json();
}

export async function getSimulationStatus(): Promise<any> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/simulation/status`));
  if (!response.ok) {
    throw new Error(`Failed to get simulation status: ${response.statusText}`);
  }
  return response.json();
}

export async function getUpcomingTrains(stationId: string): Promise<StationTimetableEventDto[]> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/stations/${encodeURIComponent(stationId)}/upcoming-trains`));
  if (!response.ok) {
    throw new Error(`Failed to get upcoming trains for station ${stationId}: ${response.statusText}`);
  }
  return response.json();
}

export async function getTrainWaypoints(trainNumber: string): Promise<TrainWayPointDto[]> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/trains/${encodeURIComponent(trainNumber)}/waypoints`));
  if (!response.ok) {
    throw new Error(`Failed to get waypoints for train ${trainNumber}: ${response.statusText}`);
  }
  return response.json();
}

export async function getTrainDetails(trainNumber: string): Promise<TrainDetailsDto> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/trains/${encodeURIComponent(trainNumber)}/details`));
  if (!response.ok) {
    throw new Error(`Failed to get details for train ${trainNumber}: ${response.statusText}`);
  }
  return response.json();
}

export async function getTrainEvents(trainNumber: string): Promise<TrainEventDto[]> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/trains/${encodeURIComponent(trainNumber)}/events`));
  if (!response.ok) {
    throw new Error(`Failed to get events for train ${trainNumber}: ${response.statusText}`);
  }
  return response.json();
}

export default {
  fetchAvailableStations,
  fetchLayout,
  fetchScenarios,
  fetchScenario,
  saveScenario,
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  getSimulationStatus,
  setSimulationSpeed,
  getUpcomingTrains,
  getTrainWaypoints,
  getTrainDetails,
  getTrainEvents,
  fetchNetwork,
  fetchLogs,
  fetchControlledStations,
};

// Advance simulation time by one minute
export async function advanceSimulationOneMinute(): Promise<any> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/simulation/advance-minute`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to advance simulation by one minute: ${response.statusText}`);
  }
  return response.json();
}

export async function setSimulationSpeed(speed: number): Promise<any> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/simulation/speed`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speed })
  });
  if (!response.ok) {
    throw new Error(`Failed to set simulation speed: ${response.statusText}`);
  }
  return response.json();
}

// Scenario REST
export async function fetchScenarios(): Promise<ScenarioSummaryDto[]> {
  const response = await fetch(`${API_BASE_URL}/scenarios`);
  if (!response.ok) {
    throw new Error(`Failed to fetch scenarios: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchScenario(id: string): Promise<ScenarioDto> {
  const response = await fetch(`${API_BASE_URL}/scenarios/${encodeURIComponent(id)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch scenario '${id}': ${response.statusText}`);
  }
  return response.json();
}

export async function saveScenario(id: string, scenario: ScenarioDto): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/scenarios/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scenario)
  });
  if (!response.ok) {
    throw new Error(`Failed to save scenario '${id}': ${response.statusText}`);
  }
  return response.json();
}

export async function fetchNetwork(layoutId?: string): Promise<NetworkDto> {
  const url = layoutId 
    ? `${API_BASE_URL}/network/${encodeURIComponent(layoutId)}`
    : `${API_BASE_URL}/network`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch network: ${response.statusText}`);
  }
  return response.json();
}

export async function startGameSession(
  gameCode: string,
  scenarioId: string
): Promise<{ gameCode: string; scenarioId: string }> {
  const url = new URL(`${API_BASE_URL}/games/start`, window.location.origin);
  url.searchParams.set("gameCode", gameCode);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId }),
  });
  if (!response.ok) {
    let message = `Failed to start game: ${response.statusText}`;
    try {
      const payload = await response.json() as { message?: string };
      if (payload.message?.trim()) {
        message = payload.message.trim();
      }
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }
  return response.json();
}

export async function endGameSession(): Promise<void> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/games/end`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to end game session: ${response.statusText}`);
  }
}

export async function fetchGameMasterSnapshot(): Promise<GameMasterSnapshotDto> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/gamemaster/snapshot`));
  if (!response.ok) {
    throw new Error(`Failed to fetch game master snapshot: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchLogs(afterId?: number): Promise<LogEntryDto[]> {
  const url = new URL(withGameCode(`${API_BASE_URL}/logs`));
  if (afterId != null && afterId > 0) {
    url.searchParams.set('afterId', String(afterId));
  }
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchControlledStations(): Promise<PlayerControlledStationDto[]> {
  const response = await fetch(withGameCode(`${API_BASE_URL}/players/controlled-stations`));
  if (!response.ok) {
    throw new Error(`Failed to fetch controlled stations: ${response.statusText}`);
  }
  return response.json();
}