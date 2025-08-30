import { 
  startSimulation,
  stopSimulation,
  pauseSimulation,
  resumeSimulation,
  resetSimulation,
  getSimulationStatus,
  advanceSimulationOneMinute
} from "../network/api";
import { SimulationStatusDto } from "../network/dto";
import "winbox/dist/winbox.bundle.min.js";

export class AdminPanel extends (window as any).WinBox {
  private container: HTMLDivElement;

  constructor(options?: Partial<{ title: string, x: any, y: any, width: number, height: number }>) {
    const container = document.createElement('div');
    // pre-create content before super call uses mount
    const panel = new AdminPanelInternal(container);
    super({
      title: options?.title ?? 'Server Control',
      x: options?.x ?? 'center',
      y: options?.y ?? 60,
      width: options?.width ?? 440,
      height: options?.height ?? 200,
      background: '#212529',
      class: ['no-full', 'modern', "no-max"],
      mount: container,
    });
    this.container = container;

    // Wire up button events
    const startBtn = this.container.querySelector('#adminStartResumeBtn') as HTMLButtonElement | null;
    const stopBtn = this.container.querySelector('#adminStopBtn') as HTMLButtonElement | null;
    const pauseBtn = this.container.querySelector('#adminPauseBtn') as HTMLButtonElement | null;
    const resumeBtn = this.container.querySelector('#adminResumeBtn') as HTMLButtonElement | null;
    const advanceBtn = this.container.querySelector('#adminAdvanceBtn') as HTMLButtonElement | null;
    const resetBtn = this.container.querySelector('#adminResetBtn') as HTMLButtonElement | null;

    if (startBtn) startBtn.addEventListener('click', () => this.handleStart());
    if (stopBtn) stopBtn.addEventListener('click', () => this.handleStop());
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.handlePause());
    if (resumeBtn) resumeBtn.addEventListener('click', () => this.handleResume());
    if (advanceBtn) advanceBtn.addEventListener('click', () => this.handleAdvanceMinute());
    if (resetBtn) resetBtn.addEventListener('click', () => this.handleReset());
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }

  public async update(): Promise<void> {
    try {
      const status = await getSimulationStatus() as SimulationStatusDto;
      const timeEl = this.container.querySelector('#adminSimulationTime') as HTMLElement | null;
      if (timeEl && status.currentTime) {
        const dt = new Date(status.currentTime);
        timeEl.textContent = dt.toLocaleTimeString();
      }
      const statusEl = this.container.querySelector('#adminSimulationStatus') as HTMLElement | null;
      if (statusEl) {
        let cls = 'text-secondary';
        switch (status.state) {
          case 'Running': cls = 'text-success'; break;
          case 'Paused': cls = 'text-warning'; break;
          case 'Error': cls = 'text-danger'; break;
        }
        statusEl.className = `fw-bold ${cls}`;
        statusEl.textContent = status.state;
      }

      // button states
      const startBtn = this.container.querySelector('#adminStartResumeBtn') as HTMLButtonElement;
      const pauseBtn = this.container.querySelector('#adminPauseBtn') as HTMLButtonElement;
      const resumeBtn = this.container.querySelector('#adminResumeBtn') as HTMLButtonElement;
      if (startBtn && pauseBtn && resumeBtn) {
        startBtn.disabled = status.state === 'Running';
        pauseBtn.disabled = status.state !== 'Running';
        resumeBtn.disabled = status.state !== 'Paused';
      }
    } catch (err) {
      console.error('AdminPanel: failed to update status', err);
    }
  }

  private async handleStart(): Promise<void> { await startSimulation(); await this.update(); }
  private async handleStop(): Promise<void> { await stopSimulation(); await this.update(); }
  private async handlePause(): Promise<void> { await pauseSimulation(); await this.update(); }
  private async handleResume(): Promise<void> { await resumeSimulation(); await this.update(); }
  private async handleReset(): Promise<void> { await resetSimulation(); await this.update(); }
  private async handleAdvanceMinute(): Promise<void> { await advanceSimulationOneMinute(); await this.update(); }
}

export default AdminPanel;
 
// Internal builder that assembles the panel content
class AdminPanelInternal {
  constructor(private host: HTMLDivElement) {
    this.init();
  }
  private init(): void {
    this.host.style.width = '100%';
    this.host.style.height = '100%';
    this.host.className = 'p-3 text-light';
    this.host.appendChild(this.createStatusSection());
    this.host.appendChild(this.createControlsSection());
  }
  private createStatusSection(): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'mb-3';
    const time = document.createElement('div');
    time.id = 'adminSimulationTime';
    time.className = 'fw-bold';
    time.textContent = '--:--:--';
    const status = document.createElement('div');
    status.className = 'small text-muted';
    status.textContent = 'Status';
    const statusValue = document.createElement('div');
    statusValue.id = 'adminSimulationStatus';
    statusValue.className = 'fw-bold text-secondary';
    statusValue.textContent = 'Stopped';
    section.appendChild(time);
    section.appendChild(status);
    section.appendChild(statusValue);
    return section;
  }
  private createControlsSection(): HTMLDivElement {
    const section = document.createElement('div');
    const title = document.createElement('h6');
    title.className = 'mb-2 text-primary';
    title.textContent = 'Controls';
    const group = document.createElement('div');
    group.className = 'd-flex flex-wrap gap-1';
    const startBtn = this.button('Start', 'btn-success');
    startBtn.id = 'adminStartResumeBtn';
    const stopBtn = this.button('Stop', 'btn-danger');
    stopBtn.id = 'adminStopBtn';
    const pauseBtn = this.button('Pause', 'btn-warning');
    pauseBtn.id = 'adminPauseBtn';
    const resumeBtn = this.button('Resume', 'btn-success');
    resumeBtn.id = 'adminResumeBtn';
    const advanceBtn = this.button('+1 min', 'btn-secondary');
    advanceBtn.id = 'adminAdvanceBtn';
    const resetBtn = this.button('Reset', 'btn-outline-light');
    resetBtn.id = 'adminResetBtn';
    group.appendChild(startBtn);
    group.appendChild(stopBtn);
    group.appendChild(pauseBtn);
    group.appendChild(resumeBtn);
    group.appendChild(advanceBtn);
    group.appendChild(resetBtn);
    section.appendChild(title);
    section.appendChild(group);
    return section;
  }
  private button(text: string, cls: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${cls}`;
    btn.textContent = text;
    return btn;
  }
}


