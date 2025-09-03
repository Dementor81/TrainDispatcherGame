import { getAllTrains, getSimulationStatus } from "../network/api";
import { SimulationStatusDto } from "../network/dto";
import "winbox/dist/winbox.bundle.min.js";

export class TrainsPanel extends (window as any).WinBox {
  private container: HTMLDivElement;

  constructor(options?: Partial<{ title: string, x: any, y: any, width: number, height: number }>) {
    const container = document.createElement('div');
    const panel = new TrainsPanelInternal(container);
    super({
      title: options?.title ?? 'Trains',
      x: options?.x ?? 'center',
      y: options?.y ?? 300,
      width: options?.width ?? 1020,
      height: options?.height ?? 520,
      background: '#212529',
      class: ['no-full', 'modern', 'no-max'],
      mount: container,
    });
    this.container = container;
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }

  public async update(): Promise<void> {
    try {
      // Optional: show sim time in header (element may not exist)
      const status = await getSimulationStatus() as SimulationStatusDto;
      const timeEl = this.container.querySelector('#trainsSimulationTime') as HTMLElement | null;
      if (timeEl && status.currentTime) {
        const dt = new Date(status.currentTime);
        timeEl.textContent = dt.toLocaleTimeString();
      }

      const listEl = this.container.querySelector('#trainsListBody') as HTMLElement | null;
      if (!listEl) return;

      const trains = await getAllTrains() as any[];
      // Normalize minimal fields we need
      const normalized: Array<any> = trains.map((t: any) => ({
        number: t.number ?? t.Number ?? '-',
        completed: t.completed ?? t.Completed ?? false,
        currentLocation: t.currentLocation ?? t.CurrentLocation ?? undefined,
        headingForStation: t.headingForStation ?? t.HeadingForStation ?? undefined,
        delay: t.delay ?? t.Delay ?? undefined,
        nextEventTime: t.nextEventTime ?? t.NextEventTime ?? t.next_event_time,
        nextEventType: t.nextEventType ?? t.NextEventType ?? t.next_event_type,
      }));

      listEl.innerHTML = '';

      if (normalized.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-muted';
        empty.textContent = 'No trains available';
        listEl.appendChild(empty);
        return;
      }

      for (const t of normalized) {
        // Derived values
        const statusText = t.completed ? 'Completed' : t.nextEventType === 'Start' ? 'not started' : 'En route';
        let locationText = t.currentLocation ? `At ${t.currentLocation}` : (t.headingForStation ? `To ${t.headingForStation}` : '-');
        const nextEventDate = t.nextEventTime ?? undefined;
        const nextEventText = nextEventDate ? new Date(nextEventDate).toLocaleTimeString() : '-';
        let eventType = t.nextEventType ?? '-';

        if (t.completed) {
          locationText = '-';
          eventType = '-';
        }

        const row = document.createElement('div');
        row.className = 'd-flex flex-row gap-2 align-items-start py-1 border-bottom border-secondary';

        const id = document.createElement('div');
        id.className = 'text-light fw-bold';
        id.style.width = '80px';
        id.textContent = String(t.number);

        const state = document.createElement('div');
        state.className = 'text-light';
        state.style.width = '110px';
        state.textContent = statusText;

        const location = document.createElement('div');
        location.className = 'text-light';
        location.style.width = '160px';
        location.textContent = locationText;

        const schedule = document.createElement('div');
        schedule.className = 'text-light';
        schedule.style.width = '140px';
        schedule.textContent = nextEventText;

        const evtType = document.createElement('div');
        evtType.className = 'text-light';
        evtType.style.width = '110px';
        evtType.textContent = eventType;

        const delay = document.createElement('div');
        delay.className = 'text-light';
        delay.style.width = '90px';
        delay.textContent = (t.delay != null) ? `${t.delay}s` : '-';

        row.appendChild(id);
        row.appendChild(state);
        row.appendChild(location);
        row.appendChild(schedule);
        row.appendChild(evtType);
        row.appendChild(delay);

        listEl.appendChild(row);
      }
    } catch (err) {
      console.error('TrainsPanel: failed to update', err);
    }
  }
}

export default TrainsPanel;

class TrainsPanelInternal {
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
    section.style.height = 'calc(100% - 40px)';
    section.style.overflow = 'auto';

    const header = document.createElement('div');
    header.className = 'd-flex flex-row gap-2 text-secondary small pb-1 border-bottom border-secondary';
    const h1 = document.createElement('div'); h1.style.width = '80px'; h1.textContent = 'Train';
    const h2 = document.createElement('div'); h2.style.width = '110px'; h2.textContent = 'Status';
    const h3 = document.createElement('div'); h3.style.width = '160px'; h3.textContent = 'Location';
    const h4 = document.createElement('div'); h4.style.width = '140px'; h4.textContent = 'Next Event';
    const h5 = document.createElement('div'); h5.style.width = '110px'; h5.textContent = 'Event Type';
    const h6 = document.createElement('div'); h6.style.width = '90px'; h6.textContent = 'Delay';
    header.appendChild(h1); header.appendChild(h2); header.appendChild(h3); header.appendChild(h4); header.appendChild(h5); header.appendChild(h6);

    const body = document.createElement('div');
    body.id = 'trainsListBody';
    body.className = 'pt-1';

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }
}


