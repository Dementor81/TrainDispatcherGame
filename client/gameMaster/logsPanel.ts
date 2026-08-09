import { fetchLogs } from "../network/api";
import { LogEntryDto, LogLevel } from "../network/dto";
import { BasePanel } from "../ui/basePanel";
import { UI } from "../utils/ui";

export class LogsPanel extends BasePanel {
  private filterInput?: HTMLInputElement;
  private lastFilterKey: string = "";
  private lastSeenId: number = 0;
  private autoScroll: boolean = true;
  private autoScrollBtn?: HTMLButtonElement;

  constructor() {
    super(null as any, { width: 620, height: 320, bottom: 0, right: 0, updateIntervalMs: 5000, title: 'Nachrichten', resizable: true });

    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "d-flex flex-column gap-2 rounded p-2";
    section.style.height = "100%";

    const filterRow = document.createElement("div");
    filterRow.className = "d-flex align-items-center gap-2";
    const filterLabel = document.createElement("label");
    filterLabel.className = "text-secondary small";
    filterLabel.textContent = "Filter: ";
    filterLabel.setAttribute("for", "logsFilterInput");
    filterLabel.style.width = "130px";
    const filterInput = document.createElement("input");
    filterInput.id = "logsFilterInput";
    filterInput.type = "text";
    filterInput.className = "form-control form-control-sm";
    filterInput.placeholder = "Bahnhof oder Zugnummer";
    filterInput.addEventListener("input", () => this.Updates());
    this.filterInput = filterInput;

    this.autoScrollBtn = UI.createButton("btn-sm", null, () => {
      this.autoScroll = !this.autoScroll;
      if (this.autoScroll) this.scrollToBottom();
      this.updateAutoScrollButton();
    });
    this.autoScrollBtn.title = "nach unten scrollen";
    this.autoScrollBtn.innerHTML = "<i class=\"bi bi-caret-down-square\"></i>";
    

    filterRow.appendChild(filterLabel);
    filterRow.appendChild(filterInput);
    filterRow.appendChild(this.autoScrollBtn);

    const output = document.createElement("div");
    output.id = "logsOutput";
    output.className = "form-control form-control-sm bg-dark no-drag";
    output.style.flex = "1 1 auto";
    output.style.overflow = "auto";
    output.style.whiteSpace = "pre-wrap";
    output.style.fontFamily = "monospace";
    output.style.fontSize = "small";
    output.addEventListener("scroll", () => {
      const atBottom = output.scrollHeight - output.clientHeight - output.scrollTop < 10;
      if (!atBottom) this.autoScroll = false;
      this.updateAutoScrollButton();
    });

    section.appendChild(filterRow);
    section.appendChild(output);
    this.updateAutoScrollButton();
    return section;
  }

  protected async Updates(): Promise<void> {
    try {
      const output = this.container.querySelector("#logsOutput") as HTMLElement | null;
      if (!output) return;

      const contexts = this.getFilterContexts();
      const filterKey = contexts.join("|");
      const filterChanged = filterKey !== this.lastFilterKey;
      if (filterChanged) {
        output.innerHTML = "";
        this.lastFilterKey = filterKey;
        this.lastSeenId = 0;
      }

      const afterId = filterChanged ? undefined : this.lastSeenId;
      const logs = await fetchLogs(contexts, afterId);

      if (!logs || logs.length === 0) {
        if (this.lastSeenId === 0 && output.childElementCount === 0) {
          const empty = document.createElement("div");
          empty.className = "text-muted";
          empty.textContent = "No logs available";
          output.appendChild(empty);
        }
        return;
      }

      if (output.firstChild && output.textContent === "No logs available") {
        output.innerHTML = "";
      }

      for (const raw of logs) {
        const entry = this.normalizeEntry(raw);
        const line = document.createElement("div");
        line.style.color = this.levelColor(entry.level);
        line.textContent = this.formatEntry(entry);
        output.appendChild(line);
        if (entry.id != null && entry.id > this.lastSeenId) {
          this.lastSeenId = entry.id;
        }
      }

      if (this.autoScroll) this.scrollToBottom();
    } catch (err) {
      console.error("LogsPanel: failed to update", err);
    }
  }

  private scrollToBottom(): void {
    const output = this.container.querySelector("#logsOutput") as HTMLElement | null;
    if (output) output.scrollTop = output.scrollHeight;
  }

  private updateAutoScrollButton(): void {
    if (!this.autoScrollBtn) return;
    this.autoScrollBtn.title = this.autoScroll ? "Auto-scroll active (click to pause)" : "Auto-scroll paused (click to resume)";
    this.autoScrollBtn.className = this.autoScroll ? "btn btn-sm btn-secondary" : "btn btn-sm btn-outline-secondary";
  }

  private getFilterContexts(): string[] {
    const value = this.filterInput?.value ?? "";
    return value
      .split(",")
      .map(v => v.trim())
      .filter(v => v.length > 0);
  }

  private normalizeEntry(entry: any): LogEntryDto {
    return {
      id: entry.id ?? entry.Id,
      simulationTime: entry.simulationTime ?? entry.SimulationTime ?? entry.simulation_time ?? entry.simulationTimeUtc,
      level: entry.level ?? entry.Level ?? "Debug",
      context: entry.context ?? entry.Context ?? "",
      message: entry.message ?? entry.Message ?? "",
    };
  }

  private levelColor(level: LogLevel): string {
    if (level == LogLevel.Error) return "#dc3545";
    if (level == LogLevel.Warning) return "#ffc107";
    if (level == LogLevel.Emergency) return "#ff0000";
    return "#f8f9fa";
  }

  private formatEntry(entry: LogEntryDto): string {
    const ts = this.resolveDisplayTime(entry);
    const ctx = entry.context ? ` [${entry.context}]` : "";
    return `${ts} ${ctx} ${entry.message}`;
  }

  private resolveDisplayTime(entry: LogEntryDto): string {
    if (!entry.simulationTime) return "--:--:--";
    return new Date(entry.simulationTime).toLocaleTimeString();
  }
}

export default LogsPanel;
