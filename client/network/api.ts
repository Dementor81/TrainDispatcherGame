import { TrackLayoutDto } from "./dto";

const API_BASE_URL = "http://localhost:5070/api/layouts";

export async function fetchAvailableLayouts(): Promise<string[]> {
  const response = await fetch(API_BASE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch layout list: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchLayout(name: string): Promise<TrackLayoutDto> {
  const response = await fetch(`${API_BASE_URL}/${encodeURIComponent(name)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch layout "${name}": ${response.statusText}`);
  }
  return response.json();
}