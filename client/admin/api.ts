const API_BASE_URL = "/api";
const STORAGE_KEY = "adminCode";
const ADMIN_CODE_HEADER = "X-Admin-Code";

export class AdminUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AdminUnauthorizedError";
  }
}

let signedOut = false;

export interface AdminSessionPlayer {
  playerId: string;
  playerName: string;
  stationId: string;
}

export interface AdminSession {
  gameCode: string;
  scenarioId: string;
  scenarioTitle: string;
  state: string;
  lastAccessUtc: string;
  players: AdminSessionPlayer[];
}

export function getAdminCode(): string {
  return sessionStorage.getItem(STORAGE_KEY)?.trim() ?? "";
}

export function clearAdminCode(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function onAdminUnauthorized(listener: () => void): void {
  window.addEventListener("admin-unauthorized", listener);
}

export async function loginAdmin(code: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(`${API_BASE_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (response.status === 401) {
    return { ok: false, message: await readMessage(response, "Ungültiger Admin-Code.") };
  }

  if (!response.ok) {
    throw new Error(await readMessage(response, "Admin-Anmeldung fehlgeschlagen."));
  }

  sessionStorage.setItem(STORAGE_KEY, code.trim());
  signedOut = false;
  return { ok: true };
}

export async function fetchAdminSessions(): Promise<AdminSession[]> {
  const response = await adminFetch(`${API_BASE_URL}/admin/sessions`);
  if (!response.ok) {
    throw new Error(await readMessage(response, "Sitzungen konnten nicht geladen werden."));
  }
  return response.json() as Promise<AdminSession[]>;
}

export interface LicenceKeyEntry {
  key: string;
  label: string;
}

export async function fetchLicenceKeys(): Promise<LicenceKeyEntry[]> {
  const response = await adminFetch(`${API_BASE_URL}/admin/keys`);
  if (!response.ok) {
    throw new Error(await readMessage(response, "Lizenzschlüssel konnten nicht geladen werden."));
  }
  return response.json() as Promise<LicenceKeyEntry[]>;
}

export async function addLicenceKey(key: string, label: string): Promise<void> {
  const response = await adminFetch(`${API_BASE_URL}/admin/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, label }),
  });

  if (response.status === 409) {
    throw new Error(await readMessage(response, "Lizenzschlüssel ist bereits vorhanden."));
  }

  if (!response.ok) {
    throw new Error(await readMessage(response, "Lizenzschlüssel konnte nicht hinzugefügt werden."));
  }
}

export async function deleteLicenceKey(encodedKey: string): Promise<void> {
  const response = await adminFetch(`${API_BASE_URL}/admin/keys`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: encodedKey }),
  });

  if (!response.ok) {
    throw new Error(await readMessage(response, "Lizenzschlüssel konnte nicht gelöscht werden."));
  }
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const code = getAdminCode();
  if (!code) {
    notifyUnauthorized();
    throw new AdminUnauthorizedError();
  }

  const headers = new Headers(init.headers);
  headers.set(ADMIN_CODE_HEADER, code);
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    notifyUnauthorized();
    throw new AdminUnauthorizedError();
  }

  return response;
}

function notifyUnauthorized(): void {
  clearAdminCode();
  if (signedOut) {
    return;
  }

  signedOut = true;
  window.dispatchEvent(new CustomEvent("admin-unauthorized"));
}

async function readMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { message?: string };
    const message = payload.message?.trim();
    return message || fallback;
  } catch {
    return fallback;
  }
}
