import { TrackLayoutDto, StationTimetableEventDto, ScenarioSummaryDto, ScenarioDto, NetworkDto, OpenLineTrackStatusDto } from "./dto";

const API_BASE_URL = "/api";

export interface StationInfo {
  id: string;
}

export async function fetchAvailableStations(): Promise<StationInfo[]> {
  const response = await fetch(`${API_BASE_URL}/layouts`);
  if (!response.ok) {
    throw new Error(`Failed to fetch station list: ${response.statusText}`);
  }
  return response.json();
}

// Keep the old function for backward compatibility
export async function fetchAvailableLayouts(): Promise<string[]> {
  const stations = await fetchAvailableStations();
  return stations.map(station => station.id);
}

export async function fetchLayout(name: string): Promise<TrackLayoutDto> {
  const response = await fetch(`${API_BASE_URL}/layouts/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch layout "${name}": ${response.statusText}`);
  }
  return response.json();
}

// Simulation control API functions
export async function startSimulation(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/simulation/start`, {
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
  const response = await fetch(`${API_BASE_URL}/simulation/stop`, {
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
  const response = await fetch(`${API_BASE_URL}/simulation/pause`, {
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
  const response = await fetch(`${API_BASE_URL}/simulation/resume`, {
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

export async function resetSimulation(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/simulation/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to reset simulation: ${response.statusText}`);
  }
  return response.json();
}

export async function getSimulationStatus(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/simulation/status`);
  if (!response.ok) {
    throw new Error(`Failed to get simulation status: ${response.statusText}`);
  }
  return response.json();
}

// All trains (active + completed)
export async function getAllTrains(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/simulation/trains`);
  if (!response.ok) {
    throw new Error(`Failed to get trains: ${response.statusText}`);
  }
  return response.json();
}

export async function getUpcomingTrains(stationId: string): Promise<StationTimetableEventDto[]> {
  const response = await fetch(`${API_BASE_URL}/stations/${encodeURIComponent(stationId)}/upcoming-trains`);
  if (!response.ok) {
    throw new Error(`Failed to get upcoming trains for station ${stationId}: ${response.statusText}`);
  }
  return response.json();
}

export default {
  fetchAvailableLayouts,
  fetchAvailableStations,
  fetchLayout,
  fetchScenarios,
  fetchScenario,
  saveScenario,
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  resetSimulation,
  getSimulationStatus,
  setSimulationSpeed,
  getAllTrains,
  getUpcomingTrains,
  fetchNetwork,
  fetchOpenLineTracks,
};

// Advance simulation time by one minute
export async function advanceSimulationOneMinute(): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/simulation/advance-minute`, {
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
  const response = await fetch(`${API_BASE_URL}/simulation/speed`, {
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

// Scenario selection on running simulation
export async function getCurrentScenario(): Promise<{ id: string }> {
  const response = await fetch(`${API_BASE_URL}/simulation/scenario`);
  if (!response.ok) {
    throw new Error(`Failed to get current scenario: ${response.statusText}`);
  }
  return response.json();
}

export async function setScenario(id: string): Promise<{ message: string; id: string }> {
  const response = await fetch(`${API_BASE_URL}/simulation/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  if (!response.ok) {
    throw new Error(`Failed to set scenario: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchOpenLineTracks(): Promise<OpenLineTrackStatusDto[]> {
  const response = await fetch(`${API_BASE_URL}/openline/tracks`);
  if (!response.ok) {
    throw new Error(`Failed to fetch open line tracks: ${response.statusText}`);
  }
  return response.json();
}