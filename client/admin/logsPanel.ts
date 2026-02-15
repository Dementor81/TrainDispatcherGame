import { fetchLogs } from "../network/api";
import { LogEntryDto, LogLevel } from "../network/dto";
import { BasePanel } from "../ui/basePanel";

export class LogsPanel extends BasePanel {
  private filterInput?: HTMLInputElement;
  private showRealTime: boolean = false;
  private lastFilterKey: string = '';
  private lastRenderedCount: number = 0;
  private autoScroll: boolean = true;
  private autoScrollBtn?: HTMLButtonElement;

  constructor() {
    super(null as any, 2000);

    Object.assign(this.container.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '720px',
      height: '320px',
      display: 'block',
      minWidth: 'unset',
      maxWidth: 'unset',
    });

    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'd-flex flex-column gap-2 rounded p-2';
    section.style.height = '100%';

    const filterRow = document.createElement('div');
    filterRow.className = 'd-flex align-items-center gap-2';
    const filterLabel = document.createElement('label');
    filterLabel.className = 'text-secondary small';
    filterLabel.textContent = 'Filter: ';
    filterLabel.setAttribute('for', 'logsFilterInput');
    filterLabel.style.width = '130px';
    const filterInput = document.createElement('input');
    filterInput.id = 'logsFilterInput';
    filterInput.type = 'text';
    filterInput.className = 'form-control form-control-sm';
    filterInput.placeholder = 'train-1, station_a';
    filterInput.addEventListener('input', () => this.Updates());
    this.filterInput = filterInput;
    const spacer = document.createElement('div');
    spacer.style.flex = '1 1 auto';

    const autoScrollBtn = document.createElement('button');
    autoScrollBtn.type = 'button';
    autoScrollBtn.className = 'btn btn-sm';
    autoScrollBtn.title = 'Toggle auto-scroll';
    autoScrollBtn.innerHTML = '<i class="bi bi-caret-down-square"></i>';
    autoScrollBtn.addEventListener('click', () => {
      this.autoScroll = !this.autoScroll;
      if (this.autoScroll) this.scrollToBottom();
      this.updateAutoScrollButton();
    });
    this.autoScrollBtn = autoScrollBtn;

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn btn-sm btn-outline-secondary';
    toggleBtn.title = 'Toggle time display';
    toggleBtn.innerHTML = '<i class="bi bi-clock"></i>';
    toggleBtn.addEventListener('click', () => {
      this.showRealTime = !this.showRealTime;
      this.Updates();
    });

    filterRow.appendChild(filterLabel);
    filterRow.appendChild(filterInput);
    filterRow.appendChild(spacer);
    filterRow.appendChild(autoScrollBtn);
    filterRow.appendChild(toggleBtn);

    const output = document.createElement('div');
    output.id = 'logsOutput';
    output.className = 'form-control form-control-sm bg-dark no-drag';
    output.style.flex = '1 1 auto';
    output.style.overflow = 'auto';
    output.style.whiteSpace = 'pre-wrap';
    output.style.fontFamily = 'monospace';
    output.style.fontSize = 'small';
    output.addEventListener('scroll', () => {
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
      const output = this.container.querySelector('#logsOutput') as HTMLElement | null;
      if (!output) return;

      const contexts = this.getFilterContexts();
      const filterKey = contexts.join('|');
      const logs = await fetchLogs(contexts);
      const shouldRebuild = filterKey !== this.lastFilterKey || logs.length < this.lastRenderedCount;

      if (shouldRebuild) {
        output.innerHTML = '';
        this.lastFilterKey = filterKey;
        this.lastRenderedCount = 0;
      }

      if (!logs || logs.length === 0) {
        if (this.lastRenderedCount === 0) {
          const empty = document.createElement('div');
          empty.className = 'text-muted';
          empty.textContent = 'No logs available';
          output.appendChild(empty);
        }
        return;
      }

      if (shouldRebuild && output.firstChild && output.textContent === 'No logs available') {
        output.innerHTML = '';
      }

      const startIndex = Math.max(this.lastRenderedCount, 0);
      for (let i = startIndex; i < logs.length; i++) {
        const entry = this.normalizeEntry(logs[i]);
        const line = document.createElement('div');
        line.style.color = this.levelColor(entry.level);
        line.textContent = this.formatEntry(entry);
        output.appendChild(line);
      }

      this.lastRenderedCount = logs.length;
      if (this.autoScroll) this.scrollToBottom();
    } catch (err) {
      console.error('LogsPanel: failed to update', err);
    }
  }

  private scrollToBottom(): void {
    const output = this.container.querySelector('#logsOutput') as HTMLElement | null;
    if (output) output.scrollTop = output.scrollHeight;
  }

  private updateAutoScrollButton(): void {
    if (!this.autoScrollBtn) return;
    this.autoScrollBtn.title = this.autoScroll ? 'Auto-scroll active (click to pause)' : 'Auto-scroll paused (click to resume)';
    this.autoScrollBtn.className = this.autoScroll ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-outline-secondary';
  }

  private getFilterContexts(): string[] {
    const value = this.filterInput?.value ?? '';
    return value
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);
  }

  private normalizeEntry(entry: any): LogEntryDto {
    return {
      timestamp: entry.timestamp ?? entry.Timestamp ?? '',
      simulationTime: entry.simulationTime ?? entry.SimulationTime ?? entry.simulation_time ?? entry.simulationTimeUtc,
      level: entry.level ?? entry.Level ?? 'Debug',
      context: entry.context ?? entry.Context ?? '',
      message: entry.message ?? entry.Message ?? '',
    };
  }

  private levelColor(level: LogLevel): string {
    if (level == LogLevel.Error) return '#dc3545';
    if (level == LogLevel.Warning) return '#ffc107';
    return '#f8f9fa';
  }

  private formatEntry(entry: LogEntryDto): string {
    const ts = this.resolveDisplayTime(entry);
    const ctx = entry.context ? ` [${entry.context}]` : '';
    return `${ts} ${ctx} ${entry.message}`;
  }

  private resolveDisplayTime(entry: LogEntryDto): string {
    const sim = entry.simulationTime ? new Date(entry.simulationTime) : null;
    const real = entry.timestamp ? new Date(entry.timestamp) : null;
    const chosen = this.showRealTime ? real : (sim ?? real);
    return chosen ? chosen.toLocaleTimeString() : '--:--:--';
  }
}

export default LogsPanel;
