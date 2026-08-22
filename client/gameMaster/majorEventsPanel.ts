import { GmSnapshotPoller } from "./gmSnapshotPoller";
import { GameMasterApplication } from "./gameMasterApplication";
import { BasePanel } from "../ui/basePanel";
import { formatTimeFromIso } from "../utils/time";
import { GameMasterSnapshotDto, MajorEventDto, MajorEventType } from "../network/dto";

const EVENT_LABELS: Record<MajorEventType, string> = {
  MissedStop: "Halt ausgelassen",
  Derailed: "Entgleisung",
  Collision: "Kollision",
  Removed: "Entfernt",
};

export class MajorEventsPanel extends BasePanel {
  private unsubscribe: (() => void) | null = null;
  private statsEl!: HTMLDivElement;
  private listEl!: HTMLDivElement;
  private events: MajorEventDto[] = [];

  private readonly onMajorEvent = (event: MajorEventDto): void => {
    this.prependEvent(event);
    this.poller.refresh();
  };

  constructor(
    app: GameMasterApplication,
    private readonly poller: GmSnapshotPoller,
    private readonly onTrainClick: (trainNumber: string) => void,
  ) {
    super(app as any, { width: 620, height: 400, right: 0, top: 270, title: "Störungen", resizable: true });
    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "d-flex flex-column rounded p-2";
    section.style.height = "100%";
    section.style.minHeight = "0";

    this.statsEl = document.createElement("div");
    this.statsEl.className = "d-flex flex-wrap gap-2 small pb-2 border-bottom border-secondary";

    const header = document.createElement("div");
    header.className = "d-flex flex-row gap-2 text-secondary small py-1 border-bottom border-secondary";
    const hTime = document.createElement("div");
    hTime.style.width = "70px";
    hTime.textContent = "Zeit";
    const hType = document.createElement("div");
    hType.style.width = "140px";
    hType.textContent = "Ereignis";
    const hTrain = document.createElement("div");
    hTrain.style.width = "140px";
    hTrain.textContent = "Zug";
    const hPlayer = document.createElement("div");
    hPlayer.style.flex = "1";
    hPlayer.textContent = "Spieler";
    header.append(hTime, hType, hTrain, hPlayer);

    this.listEl = document.createElement("div");
    this.listEl.className = "pt-1 small";
    this.listEl.style.flex = "1 1 auto";
    this.listEl.style.minHeight = "0";
    this.listEl.style.overflow = "auto";

    section.append(this.statsEl, header, this.listEl);
    this.renderStats(0, 0, 0, 0, 0);
    return section;
  }

  public override show(): void {
    const wasVisible = this.isVisible;
    super.show();
    if (!this.unsubscribe) {
      this.unsubscribe = this.poller.subscribe((snapshot) => this.applySnapshot(snapshot));
    }
    if (!wasVisible) {
      this.application.eventManager.on("majorEventOccurred", this.onMajorEvent);
    }
  }

  public override hide(): void {
    if (this.isVisible) {
      this.application.eventManager.off("majorEventOccurred", this.onMajorEvent);
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    super.hide();
  }

  private applySnapshot(snapshot: GameMasterSnapshotDto): void {
    this.events = snapshot.majorEvents ?? [];
    this.renderStats(
      snapshot.runningCount ?? 0,
      snapshot.finishedCount ?? 0,
      snapshot.removedCount ?? 0,
      snapshot.accidentCount ?? 0,
      snapshot.causedDelaySeconds ?? 0,
    );
    this.renderEvents();
  }

  private prependEvent(event: MajorEventDto): void {
    if (this.events.some((existing) => this.isSameEvent(existing, event))) return;
    this.events = [event, ...this.events];
    this.renderEvents();
  }

  private isSameEvent(a: MajorEventDto, b: MajorEventDto): boolean {
    return a.type === b.type
      && a.trainNumber === b.trainNumber
      && (a.otherTrainNumber ?? "") === (b.otherTrainNumber ?? "")
      && a.simulationTime === b.simulationTime;
  }

  private renderStats(running: number, finished: number, removed: number, accidents: number, delaySeconds: number): void {
    this.statsEl.replaceChildren(
      this.statBadge("Fahrend", String(running), "text-bg-secondary"),
      this.statBadge("Beendet", String(finished), "text-bg-success"),
      this.statBadge("Entfernt", String(removed), removed > 0 ? "text-bg-warning" : "text-bg-secondary"),
      this.statBadge("Unfälle", String(accidents), accidents > 0 ? "text-bg-danger" : "text-bg-secondary"),
      this.statBadge("Verspätung", this.formatCausedDelay(delaySeconds), delaySeconds >= 600 ? "text-bg-danger" : delaySeconds >= 60 ? "text-bg-warning" : "text-bg-secondary"),
    );
  }

  private statBadge(label: string, value: string, badgeClass: string): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "d-flex flex-column";
    const caption = document.createElement("div");
    caption.className = "text-secondary";
    caption.style.fontSize = "0.7rem";
    caption.textContent = label;
    const badge = document.createElement("span");
    badge.className = `badge ${badgeClass}`;
    badge.textContent = value;
    wrap.append(caption, badge);
    return wrap;
  }

  private renderEvents(): void {
    this.listEl.replaceChildren();

    if (this.events.length === 0) {
      const empty = document.createElement("div");
      empty.className = "text-muted";
      empty.textContent = "Keine Störungen";
      this.listEl.appendChild(empty);
      return;
    }

    for (const event of this.events) {
      const row = document.createElement("div");
      row.className = "d-flex flex-row gap-2 align-items-start py-1 border-bottom border-secondary";

      const timeEl = document.createElement("div");
      timeEl.className = "text-light";
      timeEl.style.width = "70px";
      timeEl.textContent = formatTimeFromIso(event.simulationTime, "-");

      const typeEl = document.createElement("div");
      typeEl.className = this.eventTypeClass(event.type);
      typeEl.style.width = "140px";
      typeEl.textContent = EVENT_LABELS[event.type] ?? event.type;

      const trainEl = document.createElement("div");
      trainEl.className = "d-flex flex-wrap gap-1";
      trainEl.style.width = "140px";
      trainEl.appendChild(this.trainLink(event.trainNumber));
      if (event.otherTrainNumber) {
        const sep = document.createElement("span");
        sep.className = "text-secondary";
        sep.textContent = "×";
        trainEl.append(sep, this.trainLink(event.otherTrainNumber));
      }

      const playerEl = document.createElement("div");
      playerEl.className = "text-light";
      playerEl.style.flex = "1";
      playerEl.textContent = event.playerName || event.station || "-";

      row.append(timeEl, typeEl, trainEl, playerEl);
      this.listEl.appendChild(row);
    }
  }

  private trainLink(trainNumber: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-link btn-sm p-0 align-baseline";
    btn.textContent = trainNumber;
    btn.addEventListener("click", () => this.onTrainClick(trainNumber));
    return btn;
  }

  private eventTypeClass(type: MajorEventType): string {
    if (type === "Collision" || type === "Derailed") return "text-danger fw-bold";
    if (type === "Removed") return "text-warning fw-bold";
    return "text-warning";
  }

  private formatCausedDelay(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 60) return "0min";
    return `+${Math.trunc(seconds / 60)}min`;
  }
}

export default MajorEventsPanel;
