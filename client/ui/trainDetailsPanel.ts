import { Application } from '../core/application';
import { BasePanel } from './basePanel';
import { TrainState } from '../sim/train';
import { getTrainDetails, getTrainWaypoints } from '../network/api';
import { Train } from '../sim/train';
import { UI } from '../utils/ui';
import { formatTimeFromIso, UNSET_TIME_PLACEHOLDER } from '../utils/time';
import { TrainDetailsDto, TrainWayPointDto } from '../network/dto';

export class TrainDetailsPanel extends BasePanel {
  

  private _trainNumber: string | null = null; 
  private _train: Train | null = null; //only available if train is spawned
  private _trainDetails: TrainDetailsDto | null = null;

  constructor(application: Application) {
    super(application, {
      bottom: 0,
      left: 0,
      width: 280,
      title: 'Zugdetails',
      closeable: true,
    });

    // Listen for train transformations to update panel if showing that train
    this.application.eventManager.on('trainTransformed', (train: any, oldNumber: string, newNumber: string) => {
      if (this._trainNumber === oldNumber) {
        this.selectTrain(newNumber, train);
      }
    });

    this.application.eventManager.on('trainStateChanged', (train: Train) => {
      if (!this._trainNumber || train.number !== this._trainNumber) return;
      if (train.state == TrainState.EXITING) {
        this.hide();
      }
      this._train = train;
      void this.Updates();
    });
  }


  protected createContent(): HTMLDivElement {
    const root = UI.createDiv(null, null);   


    const controls = UI.createDiv('d-flex gap-2 mb-3', 'trainControls');

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
    controls.appendChild(UI.createButton('btn-sm btn-outline-danger', 'Entfernen', () => void this.handleRemove()));

    const manualDriveControls = UI.createDiv('d-none gap-2 mb-3', 'trainManualDriveControls');
    manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-success', '\u25C0', () => this.handleManualDrive(-1)));
    manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-warning', 'Stop', () => this.handleManualDriveStop()));
    manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-success', '\u25B6', () => this.handleManualDrive(1)));

    const timetableContainer = UI.createDiv('mt-2', 'trainTimetable');

    const trainMeta = UI.createDiv('text-secondary mb-2 d-grid', 'trainDetailsMeta');
    trainMeta.style.gridTemplateColumns = '1fr 1fr';
    trainMeta.style.columnGap = '12px';
    trainMeta.style.rowGap = '2px';
    this.renderTrainMeta(trainMeta, {
      typeText: '-',
      carsText: '-',
      maxSpeedText: '-',
      stopReasonText: '-',
    });

    root.appendChild(controls);
    root.appendChild(manualDriveControls);
    root.appendChild(trainMeta);
    root.appendChild(timetableContainer);
    return root;
  }

  public setTrainNumber(trainNumber: string): void {
    this.selectTrain(trainNumber);
  }

  private selectTrain(trainNumber: string, train?: Train | null): void {
    this._trainNumber = trainNumber;
    this._train = train ?? this.application.trainManager.getTrain(trainNumber) ?? null;
    this._trainDetails = null;
    this.updateTrainMeta();
    this.renderTimetable([], null);
    void this.Updates();
    void this.loadTrainData(trainNumber);
  }

  protected async Updates(): Promise<void> {
    const train = this._train;

    const controlsEl = this.container.querySelector('#trainControls') as HTMLDivElement | null;
    if (controlsEl) {
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
  }

  private async loadTrainData(trainNumber: string): Promise<void> {
    try {
      const [trainDetails, waypoints] = await Promise.all([
        getTrainDetails(trainNumber),
        getTrainWaypoints(trainNumber),
      ]);

      if (this._trainNumber !== trainNumber) return;
      this._trainDetails = trainDetails;

      const currentTrain = this.application.trainManager.getTrain(trainNumber);
      if (currentTrain) {
        currentTrain.category = trainDetails.category ?? null;
      }
      this.renderTimetable(waypoints, trainDetails.followingTrainNumber);
      this.updateTrainMeta();
    } catch (error) {
      console.error('Failed to fetch train details or waypoints:', error);
      if (this._trainNumber !== trainNumber) return;
      const timetableContainer = this.container.querySelector('#trainTimetable') as HTMLDivElement | null;
      if (timetableContainer) {
        timetableContainer.textContent = 'Fehler beim Laden des Fahrplans';
      }
    }
  }

  private renderTimetable(
    waypoints: TrainWayPointDto[],
    followingTrainNumber: string | null | undefined
  ): void {
    const timetableContainer = this.container.querySelector('#trainTimetable') as HTMLDivElement | null;
    if (!timetableContainer) return;

    timetableContainer.innerHTML = '';

    if (waypoints.length === 0) {
      timetableContainer.textContent = 'No timetable available';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table table-sm table-dark table-striped';
    table.style.fontSize = 'small';

    const tbody = document.createElement('tbody');
    for (const wp of waypoints) {
      const row = document.createElement('tr');
      if (wp.processed) {
        row.className = 'text-muted';
      }

      const arrivalTime = formatTimeFromIso(wp.arrivalTime, UNSET_TIME_PLACEHOLDER);
      const departureTime = formatTimeFromIso(wp.departureTime, UNSET_TIME_PLACEHOLDER);

      row.innerHTML = `
        <td>${wp.station}</td>
        <td>${arrivalTime}</td>
        <td>${departureTime}</td>
      `;

      tbody.appendChild(row);
    }

    table.appendChild(tbody);

    timetableContainer.appendChild(table);
    this.renderTurnaroundHint(timetableContainer, followingTrainNumber);
  }

  private handleEmergencyStop(): void {
    if (!this._trainNumber) return;

    if (this._train!.speedCurrent <= 0.05) {
      this._train!.setState(TrainState.EMERGENCY_STOP, 0);
    } else {
      this._train!.setState(TrainState.EMERGENCY_BRAKING);
    }
    // Trigger immediate redraw/update in addition to the normal tick-based updates
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private handleResume(): void {
    this._train!.setStoppedBySignal(null); // clears internal stopped-by-signal state
    this._train!.setState(TrainState.RUNNING);
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private handleToggleManualMode(): void {
    if (!this.canToggleManualMode(this._train!)) return;

    const enableManual = !this._train!.isManualControl;
    if (!enableManual) {
      void this.exitManualModeAndRecalcDirection();
      return;
    }
    this._train!.setManualControlMode(true);
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private async exitManualModeAndRecalcDirection(): Promise<void> {
    void this.application.trainManager.continueTrainAfterManualControl(this._train!);
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private handleManualDrive(direction: 1 | -1): void {
    this._train!.setManualControlMode(true);
    if (this._train!.movingDirection !== direction) {
      const reversed = this.application.trainManager.reverseTrain(this._trainNumber!);
      if (!reversed) return;
    }
    this._train!.setStoppedBySignal(null);
    this._train!.setState(TrainState.MANUAL_CONTROL);
    this._train!.speedAimed = this._train!.maxAllowedSpeed;
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private handleManualDriveStop(): void {
    this._train!.setManualControlMode(true);
    this._train!.setState(TrainState.MANUAL_CONTROL);
    this._train!.speedAimed = 0;
    this.application.eventManager.emit('trainsUpdated');
    void this.Updates();
  }

  private async handleRemove(): Promise<void> {
    await this.application.removeTrainAndReport(this._trainNumber!);
    this.hide();
  }

  private renderTurnaroundHint(
    container: HTMLDivElement,
    followingTrainNumber: string | null | undefined
  ): void {
    if (!followingTrainNumber) return;
    container.appendChild(UI.createSpan('small text-secondary mt-1', `Wendet auf ${followingTrainNumber}`));
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
    const metaEl = this.container.querySelector('#trainDetailsMeta') as HTMLDivElement;

    const train = this._train;
    const details = this._trainDetails;
    const maxSpeed = details?.speedMax ?? train?.speedMax;

    this.renderTrainMeta(metaEl!, {
      typeText: details ? this.formatTrainType(details.type) : (train ? this.formatTrainType(train.type) : '-'),
      carsText: details ? String(details.cars) : (train ? String(train.cars) : '-'),
      maxSpeedText: this.formatTrainSpeed(maxSpeed),
      stopReasonText: train ? this.formatState(train.state) : '-',
    });
    this.setTitle(`${details?.category ?? ''} ${details?.trainNumber ?? ''}`);
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
      case TrainState.MISROUTED: return 'Fehlgeleitet';
      case TrainState.COLLISION: return 'Kollision';
      case TrainState.EMERGENCY_STOP: return 'Nothalt';
      case TrainState.DERAILEMENT: return 'Entgleisung';
      case TrainState.ENDED: return 'Fahrtende';
      case TrainState.MANUAL_CONTROL: return 'Manuelle Steuerung';
      default: return String(state);
    }
  }

  private formatTrainType(type: string | null | undefined): string {
    if (!type) {
      return '-';
    }

    switch (type) {
      case 'Passenger':
        return 'Personenzug';
      case 'Freight':
        return 'Güterzug';
      case 'MultipleUnit':
        return 'Triebzug';
      default:
        return type;
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
      const label = UI.createSpan('text-secondary', `${item.label}: `);
      const value = UI.createSpan('text-light', item.value);
      cell.appendChild(label);
      cell.appendChild(value);
      metaEl.appendChild(cell);
    }
  }
}


