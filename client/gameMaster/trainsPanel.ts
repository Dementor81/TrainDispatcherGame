import { GmSnapshotPoller } from "./gmSnapshotPoller";
import { BasePanel } from "../ui/basePanel";

export class TrainsPanel extends BasePanel {
  private unsubscribe: (() => void) | null = null;
  private filterInput?: HTMLInputElement;
  private clearBtn?: HTMLButtonElement;
  private lastTrains: any[] = [];

  constructor(
    private readonly poller: GmSnapshotPoller,
    private readonly onTrainClick: (trainNumber: string) => void,
  ) {
    super(null as any, { width: 620, height: 720, left: 0, top: 60, title: 'Alle Züge', resizable: true });
    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "d-flex flex-column rounded p-2";
    section.style.height = "100%";
    section.style.minHeight = "0";

    const filterWrap = document.createElement("div");
    filterWrap.className = "position-relative mb-2";
    filterWrap.style.maxWidth = "180px";
    filterWrap.setAttribute("data-bs-theme", "dark");

    const searchIcon = document.createElement("i");
    searchIcon.className = "bi bi-search position-absolute top-50 start-0 translate-middle-y ms-2 text-secondary";
    searchIcon.style.pointerEvents = "none";

    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.inputMode = "numeric";
    filterInput.pattern = "[0-9]*";
    filterInput.className = "form-control form-control-sm ps-4 pe-4";
    filterInput.placeholder = "Zugnummer";
    filterInput.autocomplete = "off";
    filterInput.spellcheck = false;
    filterInput.addEventListener("input", () => this.applyFilterInput());
    this.filterInput = filterInput;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn position-absolute top-50 end-0 translate-middle-y p-0 me-2 border-0 bg-transparent text-secondary d-none";
    clearBtn.title = "Clear";
    clearBtn.setAttribute("aria-label", "Clear");
    clearBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
    clearBtn.addEventListener("click", () => {
      filterInput.value = "";
      this.applyFilterInput();
      filterInput.focus();
    });
    this.clearBtn = clearBtn;

    filterWrap.append(searchIcon, filterInput, clearBtn);

    const header = document.createElement("div");
    header.className = "d-flex flex-row gap-2 text-secondary small pb-1 border-bottom border-secondary";
    const h1 = document.createElement("div"); h1.style.width = "60px"; h1.textContent = "Zug";
    const h2 = document.createElement("div"); h2.style.width = "60px"; h2.textContent = "Status";
    const h3 = document.createElement("div"); h3.style.width = "160px"; h3.textContent = "Standort";
    const h4 = document.createElement("div"); h4.style.width = "100px"; h4.textContent = "Zeitpunkt";
    const h5 = document.createElement("div"); h5.style.width = "90px"; h5.textContent = "Event Type";
    const h6 = document.createElement("div"); h6.style.width = "60px"; h6.textContent = "verspätung";
    header.appendChild(h1); header.appendChild(h2); header.appendChild(h3); header.appendChild(h4); header.appendChild(h5); header.appendChild(h6);

    const body = document.createElement("div");
    body.id = "trainsListBody";
    body.className = "pt-1 small";
    body.style.flex = "1 1 auto";
    body.style.minHeight = "0";
    body.style.overflow = "auto";

    section.append(filterWrap, header, body);
    return section;
  }

  public override show(): void {
    super.show();
    if (!this.unsubscribe) {
      this.unsubscribe = this.poller.subscribe((snapshot) => this.renderTrains(snapshot.trains));
    }
  }

  public override hide(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.hide();
  }

  private applyFilterInput(): void {
    if (this.filterInput) {
      const digits = this.filterInput.value.replace(/\D/g, "");
      if (this.filterInput.value !== digits) {
        this.filterInput.value = digits;
      }
    }
    this.clearBtn?.classList.toggle("d-none", !(this.filterInput?.value));
    this.renderTrains(this.lastTrains);
  }

  private renderTrains(trains: any[]): void {
    this.lastTrains = trains;
    if (!this.isVisible) return;

    try {
      const listEl = this.container.querySelector("#trainsListBody") as HTMLElement | null;
      if (!listEl) return;

      const normalized: Array<any> = trains.map((t: any) => ({
        number: t.number ?? t.Number ?? "-",
        completed: t.completed ?? t.Completed ?? false,
        damaged: t.damaged ?? t.Damaged ?? false,
        currentLocation: t.currentLocation ?? t.CurrentLocation ?? undefined,
        headingForStation: t.headingForStation ?? t.HeadingForStation ?? undefined,
        delay: t.delay ?? t.Delay ?? undefined,
        nextEventTime: t.nextEventTime ?? t.NextEventTime ?? t.next_event_time,
        nextEventType: t.nextEventType ?? t.NextEventType ?? t.next_event_type,
      }));

      normalized.sort((a, b) => {
        const ta = a.nextEventTime ? new Date(a.nextEventTime).getTime() : Infinity;
        const tb = b.nextEventTime ? new Date(b.nextEventTime).getTime() : Infinity;
        return ta - tb;
      });

      const query = (this.filterInput?.value ?? "").trim().toLowerCase();
      const visible = query
        ? normalized.filter((t) => String(t.number).toLowerCase().includes(query))
        : normalized;

      listEl.innerHTML = "";

      if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "text-muted";
        empty.textContent = "No trains available";
        listEl.appendChild(empty);
        return;
      }

      for (const t of visible) {
        let locationText = t.currentLocation ? `At ${t.currentLocation}` : (t.headingForStation ? `To ${t.headingForStation}` : "-");
        const nextEventDate = t.nextEventTime ?? undefined;
        const nextEventText = nextEventDate ? new Date(nextEventDate).toLocaleTimeString() : "-";
        let eventType = t.nextEventType ?? "-";

        if (t.completed) {
          locationText = "-";
          eventType = "-";
        }

        const row = document.createElement("div");
        row.className = "d-flex flex-row gap-2 align-items-start py-1 border-bottom border-secondary no-drag";
        row.style.cursor = "pointer";
        row.addEventListener("mouseenter", () => { row.style.backgroundColor = "rgba(255,255,255,0.08)"; });
        row.addEventListener("mouseleave", () => { row.style.backgroundColor = ""; });
        row.addEventListener("click", () => this.onTrainClick(String(t.number)));

        const id = document.createElement("div");
        id.className = "text-light fw-bold";
        id.style.width = "80px";
        id.textContent = String(t.number);

        const statusIcon = document.createElement("i");
        statusIcon.className = t.damaged ? "bi bi-fire text-danger"
          : t.completed ? "bi bi-check text-success"
          : t.nextEventType === "Start" ? "bi bi-pause-fill text-secondary"
          : "bi bi-play-fill text-primary";
        statusIcon.title = t.damaged ? "Damaged" : t.completed ? "Completed" : t.nextEventType === "Start" ? "Not started" : "En route";
        const state = document.createElement("div");
        state.className = "text-light";
        state.style.width = "60px";
        state.appendChild(statusIcon);

        const location = document.createElement("div");
        location.className = "text-light";
        location.style.width = "160px";
        location.textContent = locationText;

        const schedule = document.createElement("div");
        schedule.className = "text-light";
        schedule.style.width = "100px";
        schedule.textContent = nextEventText;

        const evtType = document.createElement("div");
        evtType.className = "text-light";
        evtType.style.width = "90px";
        evtType.textContent = eventType;

        const delay = document.createElement("div");
        delay.className = "text-light";
        delay.style.width = "60px";
        delay.textContent = (t.delay != null) ? `${t.delay}s` : "-";

        row.appendChild(id);
        row.appendChild(state);
        row.appendChild(location);
        row.appendChild(schedule);
        row.appendChild(evtType);
        row.appendChild(delay);

        listEl.appendChild(row);
      }
    } catch (err) {
      console.error("TrainsPanel: failed to update", err);
    }
  }
}

export default TrainsPanel;
