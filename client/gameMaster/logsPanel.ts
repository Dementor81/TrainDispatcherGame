import { fetchLogs } from "../network/api";
import { LogEntryDto, LogLevel } from "../network/dto";
import { BasePanel } from "../ui/basePanel";

export class LogsPanel extends BasePanel {
  private lastSeenId: number = 0;
  private autoScroll: boolean = true;
  private userScrolling: boolean = false;
  private autoScrollBtn?: HTMLButtonElement;

  constructor() {
    super(null, { width: 620, height: 320, bottom: 0, right: 0, updateIntervalMs: 5000, title: 'Nachrichten', resizable: true, closeable: true });

    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "d-flex flex-column rounded p-2";
    section.style.height = "100%";
    section.style.minHeight = "0";

    const wrap = document.createElement("div");
    wrap.className = "position-relative";
    wrap.style.flex = "1 1 auto";
    wrap.style.minHeight = "0";

    const output = document.createElement("div");
    output.id = "logsOutput";
    output.className = "form-control form-control-sm bg-dark no-drag h-100";
    output.style.overflow = "auto";
    output.style.whiteSpace = "pre-wrap";
    output.style.fontFamily = "monospace";
    output.style.fontSize = "small";
    const followUserScroll = () => {
      this.autoScroll = this.isAtBottom(output);
      this.updateAutoScrollButton();
    };

    output.addEventListener("wheel", () => requestAnimationFrame(followUserScroll), { passive: true });
    output.addEventListener("touchmove", followUserScroll, { passive: true });
    output.addEventListener("pointerdown", (event) => {
      this.userScrolling = event.offsetX >= output.clientWidth;
    });
    output.addEventListener("scroll", () => {
      if (this.userScrolling) followUserScroll();
    });
    window.addEventListener("pointerup", () => { this.userScrolling = false; });

    const autoScrollBtn = document.createElement("button");
    autoScrollBtn.type = "button";
    autoScrollBtn.className = "btn btn-sm btn-secondary position-absolute bottom-0 end-0 m-2 shadow-sm z-1 d-none";
    autoScrollBtn.title = "nach unten scrollen";
    autoScrollBtn.setAttribute("aria-label", "nach unten scrollen");
    autoScrollBtn.innerHTML = '<i class="bi bi-caret-down-square"></i>';
    autoScrollBtn.addEventListener("click", () => {
      this.autoScroll = true;
      this.scrollToBottom();
      this.updateAutoScrollButton();
    });
    this.autoScrollBtn = autoScrollBtn;

    wrap.append(output, autoScrollBtn);
    section.appendChild(wrap);
    this.updateAutoScrollButton();
    return section;
  }

  protected async Updates(): Promise<void> {
    try {
      const output = this.container.querySelector("#logsOutput") as HTMLElement | null;
      if (!output) return;

      const logs = await fetchLogs(this.lastSeenId);

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

      for (const entry of logs) {
        const line = document.createElement("div");
        line.style.color = this.levelColor(entry.level);
        line.textContent = this.formatEntry(entry);
        output.appendChild(line);
        if (entry.id != null && entry.id > this.lastSeenId) {
          this.lastSeenId = entry.id;
        }
      }

      if (this.autoScroll) {
        this.scrollToBottom();
        requestAnimationFrame(() => this.scrollToBottom());
      }
    } catch (err) {
      console.error("LogsPanel: failed to update", err);
    }
  }

  private isAtBottom(output: HTMLElement): boolean {
    return output.scrollHeight - output.clientHeight - output.scrollTop < 10;
  }

  private scrollToBottom(): void {
    const output = this.container.querySelector("#logsOutput") as HTMLElement | null;
    if (output) output.scrollTop = output.scrollHeight;
  }

  private updateAutoScrollButton(): void {
    this.autoScrollBtn?.classList.toggle("d-none", this.autoScroll);
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
