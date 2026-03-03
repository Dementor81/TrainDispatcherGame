import { Application } from '../core/application';
import { BasePanel } from './basePanel';
import { TrainState } from '../sim/train';
import { getTrainDetails, getTrainWaypoints } from '../network/api';
import { Train } from '../sim/train';
import { UI } from '../utils/ui';
import { TrainDetailsDto } from '../network/dto';

export class TrainDetailsPanel extends BasePanel {
  private _trainNumber: string | null = null;
  private _train: Train | null = null;
  private _trainDetails: TrainDetailsDto | null = null;
  private _timetableLoadedForTrainNumber: string | null = null;
  private _loadingTrainDataFor: string | null = null;

  constructor(application: Application) {
    super(application, {
      bottom: 0,
      left: 0,
      width: 280,
    });

    // Listen for train transformations to update panel if showing that train
    this.application.eventManager.on('trainTransformed', (train: any, oldNumber: string, newNumber: string) => {
      if (this._trainNumber === oldNumber) {
        this._train = train;
        this._trainNumber = newNumber;
        void this.Updates();
      }
    });

    this.application.eventManager.on('trainStateChanged', (train: Train) => {
      if (!this._trainNumber || train.number !== this._trainNumber) return;
      this._train = train;
      void this.Updates();
    });
  }


  protected createContent(): HTMLDivElement {
    const root = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'd-flex justify-content-between align-items-center mb-2';

    const title = document.createElement('div');
    title.className = 'fw-bold';
    title.id = 'trainDetailsTitle';
    title.textContent = `${this._train?.category} ${this._trainNumber}`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-close btn-close-white';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeBtn);

    const controls = document.createElement('div');
    controls.className = 'd-flex gap-2 mb-3';
    controls.id = 'trainControls';

    const emergencyStopBtn = UI.createButton('btn-sm btn-danger', 'Nothalt', () => this.handleEmergencyStop());
    emergencyStopBtn.id = 'trainEmergencyStopButton';
    emergencyStopBtn.style.width = '86px';
    controls.appendChild(emergencyStopBtn);

    const resumeBtn = UI.createButton('btn-sm btn-success d-none', 'Run', () => this.handleResume());
    resumeBtn.id = 'trainResumeButton';
    resumeBtn.style.width = '86px';
    controls.appendChild(resumeBtn);

    const manualToggleBtn = UI.createButton('btn-sm btn-outline-info', 'Rangieren', () => this.handleToggleManualMode());
    manualToggleBtn.id = 'trainManualModeToggle';
    controls.appendChild(manualToggleBtn);
    controls.appendChild(UI.createButton('btn-sm btn-outline-danger', 'Remove', () => void this.handleRemove()));

    const manualDriveControls = document.createElement('div');
    manualDriveControls.id = 'trainManualDriveControls';
    manualDriveControls.className = 'd-none gap-2 mb-3';
    manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-success', '\u25C0', () => this.handleManualDrive(-1)));
    manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-warning', 'Stop', () => this.handleManualDriveStop()));
    manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-success', '\u25B6', () => this.handleManualDrive(1)));

    const timetableContainer = document.createElement('div');
    timetableContainer.id = 'trainTimetable';
    timetableContainer.className = 'mt-2';

    const trainMeta = document.createElement('div');
    trainMeta.id = 'trainDetailsMeta';
    trainMeta.className = 'text-secondary mb-2 d-grid';
    trainMeta.style.gridTemplateColumns = '1fr 1fr';
    trainMeta.style.columnGap = '12px';
    trainMeta.style.rowGap = '2px';
    this.renderTrainMeta(trainMeta, {
      typeText: '-',
      carsText: '-',
      maxSpeedText: '-',
      stopReasonText: '-',
    });

    root.appendChild(header);
    root.appendChild(controls);
    root.appendChild(manualDriveControls);
    root.appendChild(trainMeta);
    root.appendChild(timetableContainer);
    return root;
  }

  public setTrainNumber(trainNumber: string): void {
    this._trainNumber = trainNumber;
    this._train = this.application.trainManager.getTrain(trainNumber) ?? null;
    this._trainDetails = null;
    this._timetableLoadedForTrainNumber = null;
    this._loadingTrainDataFor = null;
    this.Updates();
  }

  protected async Updates(): Promise<void> {
    const titleEl = this.container.querySelector('#trainDetailsTitle') as HTMLDivElement | null;
    if (!titleEl) return;
    const titleCategory = this._train?.category ?? this._trainDetails?.category ?? '';
    titleEl.textContent = `${titleCategory} ${this._trainNumber ?? ''}`.trim();

    const train = this._train;

    const controlsEl = this.container.querySelector('#trainControls') as HTMLDivElement | null;
    if (controlsEl && this._trainNumber) {
      const isSpawned = train && train.position !== null;

      if (isSpawned) {
        controlsEl.classList.remove('d-none');
        controlsEl.classList.add('d-flex');
      } else {
        controlsEl.classList.remove('d-flex');
        controlsEl.classList.add('d-none');
      }
    }

    const manualToggleBtn = this.container.querySelector('#trainManualModeToggle') as HTMLButtonElement | null;
    if (manualToggleBtn && train) {
      const isManual = train.isManualControl;
      manualToggleBtn.classList.toggle('btn-outline-info', !isManual);
      manualToggleBtn.classList.toggle('btn-info', isManual);
      const canToggleManualMode = this.canToggleManualMode(train);
      manualToggleBtn.disabled = !canToggleManualMode;
      manualToggleBtn.title = canToggleManualMode ? '' : 'Nur im Stillstand moeglich';
    }
    const emergencyStopBtn = this.container.querySelector('#trainEmergencyStopButton') as HTMLButtonElement | null;
    const resumeBtn = this.container.querySelector('#trainResumeButton') as HTMLButtonElement | null;
    if (emergencyStopBtn && resumeBtn) {
      const isEmergencyStop = train?.state === TrainState.EMERGENCY_STOP || train?.state === TrainState.EMERGENCY_BRAKING;
      emergencyStopBtn.classList.toggle('d-none', isEmergencyStop);
      resumeBtn.classList.toggle('d-none', !isEmergencyStop);
    }

    const manualDriveControls = this.container.querySelector('#trainManualDriveControls') as HTMLDivElement | null;
    if (manualDriveControls) {
      const showManualDriveControls = !!train && train.position !== null && train.isManualControl;
      manualDriveControls.classList.toggle('d-none', !showManualDriveControls);
      manualDriveControls.classList.toggle('d-flex', showManualDriveControls);
    }

    this.updateTrainMeta();
    await this.updateTimetable();
  }

  private async updateTimetable(): Promise<void> {
    const timetableContainer = this.container.querySelector('#trainTimetable') as HTMLDivElement | null;
    if (!timetableContainer || !this._trainNumber) return;

    const requestedTrainNumber = this._trainNumber;
    if (this._timetableLoadedForTrainNumber === requestedTrainNumber) {
      return;
    }
    if (this._loadingTrainDataFor === requestedTrainNumber) {
      return;
    }
    this._loadingTrainDataFor = requestedTrainNumber;

    try {
      const [trainDetails, waypoints] = await Promise.all([
        getTrainDetails(requestedTrainNumber),
        getTrainWaypoints(requestedTrainNumber),
      ]);

      if (this._trainNumber !== requestedTrainNumber) return;
      this._trainDetails = trainDetails;

      const currentTrain = this.application.trainManager.getTrain(requestedTrainNumber);
      if (currentTrain) {
        currentTrain.category = trainDetails.category ?? null;
      }
      this.updateTrainMeta();

      timetableContainer.innerHTML = '';

      if (waypoints.length === 0) {
        timetableContainer.textContent = 'No timetable available';
        return;
      }

      const table = document.createElement('table');
      table.className = 'table table-sm table-dark table-striped';
      table.style.fontSize = 'small';

      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Station</th>
          <th>Ankunft</th>
          <th>Abfahrt</th>
        </tr>
      `;

      const tbody = document.createElement('tbody');
      waypoints.forEach(wp => {
        const row = document.createElement('tr');
        if (wp.processed) {
          row.className = 'text-muted';
        }

        const arrivalTime = this.formatWaypointTime(wp.arrivalTime);
        const departureTime = this.formatWaypointTime(wp.departureTime);

        row.innerHTML = `
          <td>${wp.station}</td>
          <td>${arrivalTime}</td>
          <td>${departureTime}</td>
        `;

        tbody.appendChild(row);
      });

      table.appendChild(thead);
      table.appendChild(tbody);

      timetableContainer.appendChild(table);
      this._timetableLoadedForTrainNumber = requestedTrainNumber;

    } catch (error) {
      console.error('Failed to fetch train details or waypoints:', error);
      timetableContainer.textContent = 'Fehler beim Laden des Fahrplans';
    } finally {
      if (this._loadingTrainDataFor === requestedTrainNumber) {
        this._loadingTrainDataFor = null;
      }
    }
  }

  private handleEmergencyStop(): void {
    if (!this._trainNumber) return;
    const train = this.application.trainManager.getTrain(this._trainNumber);
    if (!train) return;

    if (train.speedCurrent <= 0.05) {
      train.setState(TrainState.EMERGENCY_STOP, 0);
    } else {
      train.setState(TrainState.EMERGENCY_BRAKING);
    }
    // Trigger immediate redraw/update in addition to the normal tick-based updates
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private handleResume(): void {
    if (!this._trainNumber) return;
    const train = this.application.trainManager.getTrain(this._trainNumber);
    if (!train) return;

    train.setStoppedBySignal(null); // clears internal stopped-by-signal state
    train.setState(TrainState.RUNNING);
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private handleToggleManualMode(): void {
    if (!this._trainNumber) return;
    const train = this.application.trainManager.getTrain(this._trainNumber);
    if (!train) return;
    if (!this.canToggleManualMode(train)) return;

    const enableManual = !train.isManualControl;
    if (!enableManual) {
      void this.exitManualModeAndRecalcDirection();
      return;
    }
    train.setManualControlMode(true);
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private async exitManualModeAndRecalcDirection(): Promise<void> {
    if (!this._trainNumber) return;
    const train = this.application.trainManager.getTrain(this._trainNumber);
    if (!train) return;

    void this.application.trainManager.continueTrainAfterManualControl(train);    
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private handleManualDrive(direction: 1 | -1): void {
    if (!this._trainNumber) return;
    const train = this.application.trainManager.getTrain(this._trainNumber);
    if (!train) return;

    train.setManualControlMode(true);
    if (train.movingDirection !== direction) {
      const reversed = this.application.trainManager.reverseTrain(this._trainNumber);
      if (!reversed) return;
    }
    train.setStoppedBySignal(null);
    train.setState(TrainState.MANUAL_CONTROL);
    train.speedAimed = train.maxAllowedSpeed;
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private handleManualDriveStop(): void {
    if (!this._trainNumber) return;
    const train = this.application.trainManager.getTrain(this._trainNumber);
    if (!train) return;

    train.setManualControlMode(true);
    train.setState(TrainState.MANUAL_CONTROL);
    train.speedAimed = 0;
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private async handleRemove(): Promise<void> {
    if (!this._trainNumber) return;
    const trainNumber = this._trainNumber;
    await this.application.removeTrainAndReport(trainNumber);
    this.hide();
  }

  private formatWaypointTime(time: string | null | undefined): string {
    if (!time) {
      return '';
    }

    const parsed = new Date(time);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }

    // DateTime.MinValue from backend means "not set".
    if (parsed.getUTCFullYear() <= 1) {
      return '';
    }

    return parsed.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private formatTrainSpeed(speedMetersPerSecond: number | null | undefined): string {
    if (speedMetersPerSecond == null || Number.isNaN(speedMetersPerSecond)) {
      return '-';
    }

    const speedKmh = Math.round(speedMetersPerSecond * 3.6);
    return `${speedKmh} km/h`;
  }

  private canToggleManualMode(train: Train): boolean {
    if (train.isManualControl) {
      return true;
    }
    const isRunningOrBraking =
      train.state === TrainState.RUNNING ||
      train.state === TrainState.BRAKING_FOR_SIGNAL ||
      train.state === TrainState.BRAKING_FOR_STATION;
    const isMoving = train.speedCurrent > 0.1;
    return !isRunningOrBraking && !isMoving;
  }

  private updateTrainMeta(): void {
    const metaEl = this.container.querySelector('#trainDetailsMeta') as HTMLDivElement | null;
    if (!metaEl) return;

    const train = this._train;
    const details = this._trainDetails;
    const maxSpeed = details?.speedMax ?? train?.speedMax;

    this.renderTrainMeta(metaEl, {
      typeText: details ? UI.translateTrainType(details.type) : (train ? UI.translateTrainType(train.type) : '-'),
      carsText: details ? String(details.cars) : (train ? String(train.cars) : '-'),
      maxSpeedText: this.formatTrainSpeed(maxSpeed),
      stopReasonText: train ? this.formatState(train.state) : '-',
    });
  }

  private formatState(state: TrainState): string {
    switch (state) {
      case TrainState.RUNNING: return 'Fahrt';
      case TrainState.EMERGENCY_BRAKING: return 'Nothalt (Bremsung)';
      case TrainState.BRAKING_FOR_SIGNAL: return 'Bremsung vor Signal';
      case TrainState.WAITING_AT_SIGNAL: return 'Warten am Signal';
      case TrainState.BRAKING_FOR_STATION: return 'Bremsung vor Bahnhof';
      case TrainState.WAITING_AT_STATION: return 'Bahnhofshalt';
      case TrainState.END_OF_TRACK: return 'Streckenende';
      case TrainState.COLLISION: return 'Kollision';
      case TrainState.EMERGENCY_STOP: return 'Nothalt';
      case TrainState.DERAILEMENT: return 'Entgleisung';
      case TrainState.ENDED: return 'Fahrtende';
      case TrainState.MANUAL_CONTROL: return 'Manuelle Steuerung';
      default: return String(state);
    }
  }

  private renderTrainMeta(
    metaEl: HTMLDivElement,
    values: {
      typeText: string;
      carsText: string;
      maxSpeedText: string;
      stopReasonText: string;
    }
  ): void {
    metaEl.innerHTML = '';
    const items: Array<{ label: string; value: string }> = [
      { label: 'Typ', value: values.typeText },
      { label: 'Wagen', value: values.carsText },
      { label: 'vmax', value: values.maxSpeedText },
      { label: 'Status', value: values.stopReasonText },
    ];

    for (const item of items) {
      const cell = document.createElement('div');
      if (item.label === 'Status') {
        cell.style.gridColumn = '1 / -1';
      }
      const label = document.createElement('span');
      label.className = 'text-secondary';
      label.textContent = `${item.label}: `;
      const value = document.createElement('span');
      value.className = 'text-light';
      value.textContent = item.value;
      cell.appendChild(label);
      cell.appendChild(value);
      metaEl.appendChild(cell);
    }
  }
}


