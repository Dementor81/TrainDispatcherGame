import { fetchControlledStations } from "../network/api";
import { BasePanel } from "../ui/basePanel";

export class PlayersPanel extends BasePanel {
  constructor() {
    super(null as any, { width: 620, height: 260, right: 0, top: 0, updateIntervalMs: 2000, title: 'Alle Spieler', resizable: true });

    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "rounded p-2 small";
    section.style.height = "100%";
    section.style.overflow = "auto";

    const header = document.createElement("div");
    header.className = "d-flex flex-row gap-2 text-secondary small pb-1 border-bottom border-secondary";
    const h1 = document.createElement("div"); h1.style.width = "180px"; h1.textContent = "Spieler";
    const h2 = document.createElement("div"); h2.style.flex = "1 1 auto"; h2.textContent = "Station";
    header.appendChild(h1); header.appendChild(h2);

    const body = document.createElement("div");
    body.id = "playersListBody";
    body.className = "pt-1";

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  protected async Updates(): Promise<void> {
    try {
      const listEl = this.container.querySelector("#playersListBody") as HTMLElement | null;
      if (!listEl) return;

      const players = await fetchControlledStations();
      listEl.innerHTML = "";

      if (!players || players.length === 0) {
        const empty = document.createElement("div");
        empty.className = "text-muted";
        empty.textContent = "No connected players";
        listEl.appendChild(empty);
        return;
      }

      for (const p of players) {
        const row = document.createElement("div");
        row.className = "d-flex flex-row gap-2 align-items-start py-1 border-bottom border-secondary";        

        const name = document.createElement("div");
        name.className = "text-light";
        name.style.width = "180px";
        name.textContent = p.playerName || "-";

        const station = document.createElement("div");
        station.className = "text-light";
        station.style.flex = "1 1 auto";
        station.textContent = p.stationId || "-";

        row.appendChild(name);
        row.appendChild(station);
        listEl.appendChild(row);
      }
    } catch (err) {
      console.error("PlayersPanel: failed to update", err);
    }
  }
}

export default PlayersPanel;
