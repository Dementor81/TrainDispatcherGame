import { Application } from '../core/application';
import { BasePanel } from './basePanel';
import { TrainStopReason } from '../sim/train';
import { getTrainWaypoints } from '../network/api';
import { TrainWayPointDto } from '../network/dto';

export class TrainDetailsPanel extends BasePanel {
  private _trainNumber: string | null = null;

  constructor(application: Application) {
    super(application, null);

    // Listen for train transformations to update panel if showing that train
    this.application.eventManager.on('trainTransformed', (train: any, oldNumber: string, newNumber: string) => {
      if (this._trainNumber === oldNumber) {
        this._trainNumber = newNumber;
        void this.Updates();
      }
    });
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
    controls.className = 'd-flex gap-2 mb-3';
    controls.id = 'trainControls';

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

    const timetableContainer = document.createElement('div');
    timetableContainer.id = 'trainTimetable';
    timetableContainer.className = 'mt-2';

    root.appendChild(header);
    root.appendChild(controls);
    root.appendChild(timetableContainer);
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

    const controlsEl = this.container.querySelector('#trainControls') as HTMLDivElement | null;
    if (controlsEl && this._trainNumber) {
      const train = this.application.trainManager.getTrain(this._trainNumber);
      const isSpawned = train && train.position !== null;
      
      if (isSpawned) {
        controlsEl.classList.remove('d-none');
        controlsEl.classList.add('d-flex');
      } else {
        controlsEl.classList.remove('d-flex');
        controlsEl.classList.add('d-none');
      }
    }

    await this.updateTimetable();
  }

  private async updateTimetable(): Promise<void> {
    const timetableContainer = this.container.querySelector('#trainTimetable') as HTMLDivElement | null;
    if (!timetableContainer || !this._trainNumber) return;

    try {
      const waypoints = await getTrainWaypoints(this._trainNumber);
      
      timetableContainer.innerHTML = '';
      
      if (waypoints.length === 0) {
        timetableContainer.textContent = 'No timetable available';
        return;
      }

      const table = document.createElement('table');
      table.className = 'table table-sm table-dark table-striped';
      table.style.fontSize = 'x-small';
      
      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Station</th>
          <th>Ankunft</th>
          <th>Abfahrt</th>
          <th>Status</th>
        </tr>
      `;
      
      const tbody = document.createElement('tbody');
      waypoints.forEach(wp => {
        const row = document.createElement('tr');
        if (wp.processed) {
          row.className = 'text-muted';
        }
        
        const arrivalTime = new Date(wp.arrivalTime).toLocaleTimeString('de-DE', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        const departureTime = new Date(wp.departureTime).toLocaleTimeString('de-DE', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });

        const statusIcon = wp.processed ? '✓' : wp.isLast ? '⏹' : wp.stops ? '■' : '○';
        const statusText = wp.processed ? 'Erledigt' : wp.isLast ? 'Ende' : wp.stops ? 'Halt' : 'Durchfahrt';

        row.innerHTML = `
          <td>${wp.station}</td>
          <td>${arrivalTime}</td>
          <td>${departureTime}</td>
          <td>${statusIcon} ${statusText}</td>
        `;
        
        tbody.appendChild(row);
      });
      
      table.appendChild(thead);
      table.appendChild(tbody);
      
      timetableContainer.appendChild(table);
      
    } catch (error) {
      console.error('Failed to fetch train waypoints:', error);
      timetableContainer.textContent = 'Fehler beim Laden des Fahrplans';
    }
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


