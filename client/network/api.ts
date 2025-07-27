import { TrackLayoutDto } from "./dto";

const API_BASE_URL = "http://localhost:5070/api";

export async function fetchAvailableLayouts(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/layouts`);
  if (!response.ok) {
    throw new Error(`Failed to fetch layout list: ${response.statusText}`);
  }
  return response.json();
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

export async function getActiveTrains(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/simulation/trains/active`);
  if (!response.ok) {
    throw new Error(`Failed to get active trains: ${response.statusText}`);
  }
  return response.json();
}

export default {
  fetchAvailableLayouts,
  fetchLayout,
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  resetSimulation,
  getSimulationStatus,
  getActiveTrains,
};