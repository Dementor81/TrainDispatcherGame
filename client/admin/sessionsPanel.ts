import { AdminSession, AdminUnauthorizedError, fetchAdminSessions } from "./api";
import { BasePanel } from "../ui/basePanel";

const STATE_LABELS: Record<string, string> = {
  Running: "Läuft",
  Paused: "Pausiert",
  Stopped: "Gestoppt",
  Error: "Fehler",
};

export class SessionsPanel extends BasePanel {
  private listEl!: HTMLDivElement;

  constructor() {
    super(null, {
      updateIntervalMs: 2000,
      width: 860,
      height: 360,
      top: 72,
      left: 8,
      title: "Sitzungen",
      resizable: true,
      closeable: true,
    });
    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "rounded p-2 small";
    section.style.height = "100%";
    section.style.overflow = "auto";

    const header = document.createElement("div");
    header.className = "d-flex flex-row gap-2 text-secondary small pb-1 border-bottom border-secondary";
    header.append(
      column("Game-Code", "110px"),
      column("Szenario", "180px"),
      column("Status", "90px"),
      column("Spieler", "1 1 auto"),
      column("Letzter Zugriff", "160px"),
    );

    this.listEl = document.createElement("div");
    this.listEl.className = "pt-1";
    section.append(header, this.listEl);
    return section;
  }

  protected override async Updates(): Promise<void> {
    try {
      this.renderSessions(await fetchAdminSessions());
    } catch (error) {
      if (error instanceof AdminUnauthorizedError) {
        return;
      }
      this.renderMessage("Sitzungen konnten nicht geladen werden.");
    }
  }

  private renderSessions(sessions: AdminSession[]): void {
    if (!this.isVisible) {
      return;
    }

    this.listEl.replaceChildren();
    if (sessions.length === 0) {
      this.renderMessage("Keine laufenden Sitzungen");
      return;
    }

    for (const session of sessions) {
      const row = document.createElement("div");
      row.className = "d-flex flex-row gap-2 align-items-start py-1 border-bottom border-secondary";
      row.append(
        cell(session.gameCode, "110px"),
        cell(session.scenarioTitle || session.scenarioId, "180px"),
        cell(STATE_LABELS[session.state] ?? session.state, "90px"),
        playersCell(session),
        cell(formatLastAccess(session.lastAccessUtc), "160px"),
      );
      this.listEl.appendChild(row);
    }
  }

  private renderMessage(message: string): void {
    this.listEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "text-muted";
    empty.textContent = message;
    this.listEl.appendChild(empty);
  }
}

function column(label: string, size: string): HTMLDivElement {
  const header = document.createElement("div");
  header.textContent = label;
  applySize(header, size);
  return header;
}

function cell(text: string, size: string): HTMLDivElement {
  const value = document.createElement("div");
  value.className = "text-light";
  value.textContent = text || "–";
  applySize(value, size);
  return value;
}

function playersCell(session: AdminSession): HTMLDivElement {
  const value = document.createElement("div");
  value.className = "text-light";
  value.style.flex = "1 1 auto";
  if (session.players.length === 0) {
    value.textContent = "–";
    return value;
  }

  for (const player of session.players) {
    const line = document.createElement("div");
    const name = player.playerName.trim() || "–";
    const station = player.stationId.trim();
    line.textContent = station ? `${name} (${station})` : name;
    value.appendChild(line);
  }
  return value;
}

function applySize(element: HTMLDivElement, size: string): void {
  if (size.includes(" ")) {
    element.style.flex = size;
    return;
  }
  element.style.width = size;
  element.style.flex = "0 0 auto";
}

function formatLastAccess(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "–";
  }
  return date.toLocaleString();
}
