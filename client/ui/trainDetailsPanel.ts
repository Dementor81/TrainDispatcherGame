import { Application } from '../core/application';
import { BasePanel } from './basePanel';
import { TrainStopReason } from '../sim/train';

export class TrainDetailsPanel extends BasePanel {
  private _trainNumber: string | null = null;

  constructor(application: Application) {
    super(application, null);
  }

  protected getContainerId(): string { return 'trainDetailsPanel'; }
  protected getContainerClasses(): string { return super.getContainerClasses() + ' top-0 start-0'; }

  protected createContent(): HTMLDivElement {
    const root = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between align-items-center mb-2';

    const title = document.createElement('div');
    title.className = 'fw-bold';
    title.id = 'trainDetailsTitle';
    title.textContent = this._trainNumber ? `Zug ${this._trainNumber}` : 'Zug';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-sm btn-outline-light';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeBtn);

    const controls = document.createElement('div');
    controls.className = 'd-flex gap-2';

    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn btn-sm btn-danger';
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', () => this.handleEmergencyStop());

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'btn btn-sm btn-success';
    resumeBtn.textContent = 'Run';
    resumeBtn.addEventListener('click', () => this.handleResume());

    const reverseBtn = document.createElement('button');
    reverseBtn.className = 'btn btn-sm btn-secondary';
    reverseBtn.textContent = 'Reverse';
    reverseBtn.addEventListener('click', () => this.handleReverse());

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-sm btn-outline-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => void this.handleRemove());

    controls.appendChild(stopBtn);
    controls.appendChild(resumeBtn);
    controls.appendChild(reverseBtn);
    controls.appendChild(removeBtn);

    root.appendChild(header);
    root.appendChild(controls);
    return root;
  }

  public setTrainNumber(trainNumber: string): void {
    this._trainNumber = trainNumber;
    this.Updates();
  }

  protected async Updates(): Promise<void> {
    const titleEl = this.container.querySelector('#trainDetailsTitle') as HTMLDivElement | null;
    if (!titleEl) return;
    titleEl.textContent = this._trainNumber ? `Zug ${this._trainNumber}` : 'Zug';
  }

  private handleEmergencyStop(): void {
    if (!this._trainNumber) return;
    const train = this.application.trainManager.getTrain(this._trainNumber);
    if (!train) return;

    train.setStopReason(TrainStopReason.EMERGENCY_STOP);
    // Trigger immediate redraw/update in addition to the normal tick-based updates
    this.application.eventManager.emit('trainsUpdated');
  }

  private handleResume(): void {
    if (!this._trainNumber) return;
    const train = this.application.trainManager.getTrain(this._trainNumber);
    if (!train) return;

    train.setStoppedBySignal(null); // clears internal stopped-by-signal state
    train.setStopReason(TrainStopReason.NONE);
    this.application.eventManager.emit('trainsUpdated');
  }

  private handleReverse(): void {
    if (!this._trainNumber) return;
    const ok = this.application.trainManager.reverseTrain(this._trainNumber);
    if (!ok) return;
    this.application.eventManager.emit('trainsUpdated');
  }

  private async handleRemove(): Promise<void> {
    if (!this._trainNumber) return;
    const trainNumber = this._trainNumber;
    await this.application.removeTrainAndReport(trainNumber);
    this.hide();
  }
}


