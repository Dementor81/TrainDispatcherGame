import { fetchOpenLineTracks } from "../network/api";
import "winbox/dist/winbox.bundle.min.js";

export class OpenLinePanel extends (window as any).WinBox {
  private container: HTMLDivElement;
  private updateTimer: number | null = null;

  constructor(options?: Partial<{ title: string; x: any; y: any; width: number; height: number }>) {
    const container = document.createElement("div");
    const panel = new OpenLinePanelInternal(container);
    super({
      title: options?.title ?? "Open Line Tracks",
      x: options?.x ?? "right",
      y: options?.y ?? 300,
      width: options?.width ?? 720,
      height: options?.height ?? 520,
      background: "#212529",
      class: ["no-full", "modern", "no-max"],
      mount: container,
    });
    this.container = container;
    void this.update();
    this.updateTimer = window.setInterval(() => this.update(), 2000);
    (this as any).onclose = () => {
      if (this.updateTimer !== null) {
        clearInterval(this.updateTimer);
        this.updateTimer = null;
      }
    };
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }

  public async update(): Promise<void> {
    try {
      const listEl = this.container.querySelector('#openLineListBody') as HTMLElement | null;
      if (!listEl) return;

      const tracks = await fetchOpenLineTracks();
      listEl.innerHTML = "";

      if (!tracks || tracks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-muted';
        empty.textContent = 'No open line tracks available';
        listEl.appendChild(empty);
        return;
      }

      for (const t of tracks) {
        const row = document.createElement('div');
        row.className = 'd-flex flex-row gap-2 align-items-start py-1 border-bottom border-secondary';

        const from = document.createElement('div');
        from.className = 'text-light';
        from.style.width = '160px';
        from.textContent = `${t.from} (${t.fromExitId})`;

        const to = document.createElement('div');
        to.className = 'text-light';
        to.style.width = '160px';
        to.textContent = `${t.to} (${t.toExitId})`;

        const mode = document.createElement('div');
        mode.className = 'text-light';
        mode.style.width = '120px';
        mode.textContent = t.mode ?? '-';

        const blocks = document.createElement('div');
        blocks.className = 'text-light';
        blocks.style.width = '80px';
        blocks.textContent = String(t.blocks ?? '-')

        const trains = document.createElement('div');
        trains.className = 'text-light';
        trains.style.flex = '1 1 auto';
        trains.textContent = (t.trains && t.trains.length > 0) ? t.trains.join(', ') : '-';

        row.appendChild(from);
        row.appendChild(to);
        row.appendChild(mode);
        row.appendChild(blocks);
        row.appendChild(trains);

        listEl.appendChild(row);
      }
    } catch (err) {
      console.error('OpenLinePanel: failed to update', err);
    }
  }
}

export default OpenLinePanel;

class OpenLinePanelInternal {
  constructor(private host: HTMLDivElement) {
    this.init();
  }
  private init(): void {
    this.host.style.width = '100%';
    this.host.style.height = '100%';
    this.host.className = 'p-3 text-light';
    this.host.appendChild(this.createList());
  }

  private createList(): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'border border-secondary rounded p-2';
    section.style.height = 'calc(100% - 0px)';
    section.style.overflow = 'auto';

    const header = document.createElement('div');
    header.className = 'd-flex flex-row gap-2 text-secondary small pb-1 border-bottom border-secondary';
    const h1 = document.createElement('div'); h1.style.width = '160px'; h1.textContent = 'From (Exit)';
    const h2 = document.createElement('div'); h2.style.width = '160px'; h2.textContent = 'To (Exit)';
    const h3 = document.createElement('div'); h3.style.width = '120px'; h3.textContent = 'Mode';
    const h4 = document.createElement('div'); h4.style.width = '80px'; h4.textContent = 'Blocks';
    const h5 = document.createElement('div'); h5.style.flex = '1 1 auto'; h5.textContent = 'Trains';
    header.appendChild(h1); header.appendChild(h2); header.appendChild(h3); header.appendChild(h4); header.appendChild(h5);

    const body = document.createElement('div');
    body.id = 'openLineListBody';
    body.className = 'pt-1';

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }
}


