import { getTrainEvents } from "../network/api";
import { TrainEventDto } from "../network/dto";
import { BasePanel } from "../ui/basePanel";

export class TrainEventsPanel extends BasePanel {
  private trainNumber: string | null = null;
  private listEl!: HTMLDivElement;

  constructor() {
    super(null, {
      width: 620,
      height: 400,
      left: 630,
      top: 410,
      title: "Ereignisse",
      resizable: true,
      closeable: true,
      updateIntervalMs: 5000,
    });
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "rounded p-2";
    section.style.height = "100%";
    section.style.overflow = "auto";

    const header = document.createElement("div");
    header.className = "d-flex flex-row gap-2 text-secondary small pb-1 border-bottom border-secondary";
    const hTime = document.createElement("div");
    hTime.style.width = "90px";
    hTime.textContent = "Zeit";
    const hType = document.createElement("div");
    hType.style.width = "120px";
    hType.textContent = "Typ";
    const hStatus = document.createElement("div");
    hStatus.style.width = "70px";
    hStatus.textContent = "Status";
    const hData = document.createElement("div");
    hData.style.flex = "1";
    hData.textContent = "Details";
    header.appendChild(hTime);
    header.appendChild(hType);
    header.appendChild(hStatus);
    header.appendChild(hData);

    this.listEl = document.createElement("div");
    this.listEl.className = "pt-1 small";

    section.appendChild(header);
    section.appendChild(this.listEl);
    return section;
  }

  public showTrain(trainNumber: string): void {
    this.trainNumber = trainNumber;
    this.setTitle(`Ereignisse ${trainNumber}`);
    this.show();
    void this.Updates();
  }

  protected async Updates(): Promise<void> {
    if (!this.trainNumber) return;

    try {
      const events = await getTrainEvents(this.trainNumber);
      this.renderEvents(events);
    } catch (err) {
      console.error("TrainEventsPanel: failed to update", err);
    }
  }

  private renderEvents(events: TrainEventDto[]): void {
    this.listEl.innerHTML = "";

    if (events.length === 0) {
      const empty = document.createElement("div");
      empty.className = "text-muted";
      empty.textContent = "Keine Ereignisse";
      this.listEl.appendChild(empty);
      return;
    }

    for (const raw of events) {
      const type = raw.type ?? "-";
      const scheduledTime = raw.scheduledTime;
      const processed = raw.processed ?? false;
      const data = raw.data ?? {};

      const row = document.createElement("div");
      row.className = "d-flex flex-row gap-2 align-items-start py-1 border-bottom border-secondary";

      const timeEl = document.createElement("div");
      timeEl.className = "text-light";
      timeEl.style.width = "90px";
      timeEl.textContent = scheduledTime ? new Date(scheduledTime).toLocaleTimeString() : "-";

      const typeEl = document.createElement("div");
      typeEl.className = "text-light fw-bold";
      typeEl.style.width = "120px";
      typeEl.textContent = String(type);

      const statusEl = document.createElement("div");
      statusEl.className = processed ? "text-success" : "text-warning";
      statusEl.style.width = "70px";
      statusEl.textContent = processed ? "done" : "pending";

      const dataEl = document.createElement("div");
      dataEl.className = "text-secondary";
      dataEl.style.flex = "1";
      dataEl.style.wordBreak = "break-word";
      dataEl.textContent = this.formatData(data);

      row.appendChild(timeEl);
      row.appendChild(typeEl);
      row.appendChild(statusEl);
      row.appendChild(dataEl);
      this.listEl.appendChild(row);
    }
  }

  private formatData(data: Record<string, unknown>): string {
    return Object.entries(data)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => `${key}: ${value}`)
      .join(", ");
  }
}

export default TrainEventsPanel;
