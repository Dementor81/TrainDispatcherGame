import { fetchPlayers } from "../network/api";
import { BasePanel } from "../ui/basePanel";

export class PlayersPanel extends BasePanel {
  constructor() {
    super(null as any, 2000);

    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      width: '620px',
      height: '260px',
      display: 'block',
      minWidth: 'unset',
      maxWidth: 'unset',
    });

    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'border border-secondary rounded p-2 small';
    section.style.height = '100%';
    section.style.overflow = 'auto';

    const header = document.createElement('div');
    header.className = 'd-flex flex-row gap-2 text-secondary small pb-1 border-bottom border-secondary';
    const h1 = document.createElement('div'); h1.style.width = '160px'; h1.textContent = 'Player Id';
    const h2 = document.createElement('div'); h2.style.width = '180px'; h2.textContent = 'Name';
    const h3 = document.createElement('div'); h3.style.flex = '1 1 auto'; h3.textContent = 'Station';
    header.appendChild(h1); header.appendChild(h2); header.appendChild(h3);

    const body = document.createElement('div');
    body.id = 'playersListBody';
    body.className = 'pt-1';

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  protected async Updates(): Promise<void> {
    try {
      const listEl = this.container.querySelector('#playersListBody') as HTMLElement | null;
      if (!listEl) return;

      const players = await fetchPlayers();
      listEl.innerHTML = "";

      if (!players || players.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-muted';
        empty.textContent = 'No connected players';
        listEl.appendChild(empty);
        return;
      }

      for (const p of players) {
        const row = document.createElement('div');
        row.className = 'd-flex flex-row gap-2 align-items-start py-1 border-bottom border-secondary';

        const id = document.createElement('div');
        id.className = 'text-light';
        id.style.width = '160px';
        id.textContent = p.id || '-';

        const name = document.createElement('div');
        name.className = 'text-light';
        name.style.width = '180px';
        name.textContent = p.name || '-';

        const station = document.createElement('div');
        station.className = 'text-light';
        station.style.flex = '1 1 auto';
        station.textContent = p.stationId || '-';

        row.appendChild(id);
        row.appendChild(name);
        row.appendChild(station);
        listEl.appendChild(row);
      }
    } catch (err) {
      console.error('PlayersPanel: failed to update', err);
    }
  }
}

export default PlayersPanel;
