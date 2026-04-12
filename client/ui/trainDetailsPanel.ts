import { Application } from '../core/application';
import { BasePanel } from './basePanel';
import { TrainState } from '../sim/train';
import { getTrainDetails, getTrainWaypoints } from '../network/api';
import { Train } from '../sim/train';
import { UI } from '../utils/ui';
import { formatTimeFromIso, UNSET_TIME_PLACEHOLDER } from '../utils/time';
import { TrainDetailsDto, TrainWayPointDto } from '../network/dto';

export class TrainDetailsPanel extends BasePanel {

  private static readonly STATE_LABELS: Record<string, string> = {
    [TrainState.RUNNING]: 'Fahrt',
    [TrainState.EMERGENCY_BRAKING]: 'Nothalt (Bremsung)',
    [TrainState.BRAKING_FOR_SIGNAL]: 'Bremsung vor Signal',
    [TrainState.WAITING_AT_SIGNAL]: 'Warten am Signal',
    [TrainState.BRAKING_FOR_STATION]: 'Bremsung am Bahnsteig',
    [TrainState.WAITING_AT_STATION]: 'Bahnhofshalt',
    [TrainState.WAITING_FOR_NEXT_SERVICE]: 'Warten auf Folgefahrt',
    [TrainState.END_OF_TRACK]: 'Streckenende',
    [TrainState.MISROUTED]: 'Fehlgeleitet',
    [TrainState.COLLISION]: 'Kollision',
    [TrainState.EMERGENCY_STOP]: 'Nothalt',
    [TrainState.DERAILEMENT]: 'Entgleisung',
    [TrainState.ENDED]: 'Fahrtende',
    [TrainState.MANUAL_CONTROL]: 'Manuelle Steuerung',
  };

  private static readonly TYPE_LABELS: Record<string, string> = {
    Passenger: 'Personenzug',
    Freight: 'Güterzug',
    MultipleUnit: 'Triebzug',
  };

  private _trainNumber: string | null = null;
  private _train: Train | null = null;
  private _trainDetails: TrainDetailsDto | null = null;

  private controlsEl!: HTMLDivElement;
  private emergencyStopBtn!: HTMLButtonElement;
  private resumeBtn!: HTMLButtonElement;
  private manualToggleBtn!: HTMLButtonElement;
  private manualDriveControls!: HTMLDivElement;
  private timetableContainer!: HTMLDivElement;
  private metaTypeValue!: HTMLSpanElement;
  private metaCarsValue!: HTMLSpanElement;
  private metaSpeedValue!: HTMLSpanElement;
  private metaStatusValue!: HTMLSpanElement;

  constructor(application: Application) {
    super(application, {
      bottom: 0,
      left: 0,
      width: 280,
      title: 'Zugdetails',
      closeable: true,
    });

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

    this.controlsEl = UI.createDiv('d-flex gap-2 mb-3', null);

    this.emergencyStopBtn = UI.createButton('btn-sm btn-danger', 'Nothalt', () => this.handleEmergencyStop());
    this.emergencyStopBtn.style.width = '86px';
    this.controlsEl.appendChild(this.emergencyStopBtn);

    this.resumeBtn = UI.createButton('btn-sm btn-success d-none', 'Start', () => this.handleResume());
    this.resumeBtn.style.width = '86px';
    this.controlsEl.appendChild(this.resumeBtn);

    this.manualToggleBtn = UI.createButton('btn-sm btn-outline-info', 'Rangieren', () => this.handleToggleManualMode());
    this.controlsEl.appendChild(this.manualToggleBtn);
    this.controlsEl.appendChild(UI.createButton('btn-sm btn-outline-danger', 'Entfernen', () => void this.handleRemove()));

    this.manualDriveControls = UI.createDiv('d-none gap-2 mb-3', null);
    this.manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-success', '\u25C0', () => this.handleManualDrive(-1)));
    this.manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-warning', 'Stop', () => this.handleManualDriveStop()));
    this.manualDriveControls.appendChild(UI.createButton('btn-sm btn-outline-success', '\u25B6', () => this.handleManualDrive(1)));

    this.timetableContainer = UI.createDiv('mt-2', null);

    const trainMeta = UI.createDiv('text-secondary mb-2 d-grid', null);
    trainMeta.style.gridTemplateColumns = '1fr 1fr';
    trainMeta.style.columnGap = '12px';
    trainMeta.style.rowGap = '2px';
    this.metaTypeValue = this.appendMetaRow(trainMeta, 'Typ', '-');
    this.metaCarsValue = this.appendMetaRow(trainMeta, 'Wagen', '-');
    this.metaSpeedValue = this.appendMetaRow(trainMeta, 'vmax', '-');
    this.metaStatusValue = this.appendMetaRow(trainMeta, 'Status', '-', '1 / -1');

    root.appendChild(this.controlsEl);
    root.appendChild(this.manualDriveControls);
    root.appendChild(trainMeta);
    root.appendChild(this.timetableContainer);
    return root;
  }

  private appendMetaRow(parent: HTMLDivElement, label: string, initial: string, gridColumn?: string): HTMLSpanElement {
    const cell = document.createElement('div');
    if (gridColumn) cell.style.gridColumn = gridColumn;
    cell.appendChild(UI.createSpan('text-secondary', `${label}: `));
    const valueSpan = UI.createSpan('text-light', initial);
    cell.appendChild(valueSpan);
    parent.appendChild(cell);
    return valueSpan;
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
    const isSpawned = !!train && train.position !== null;

    this.setVisible(this.controlsEl, isSpawned);

    if (train) {
      const isManual = train.state === TrainState.MANUAL_CONTROL;
      this.manualToggleBtn.classList.toggle('btn-outline-info', !isManual);
      this.manualToggleBtn.classList.toggle('btn-info', isManual);
      const canToggle = train.speedCurrent <= 0.1;
      this.manualToggleBtn.disabled = !canToggle;
      this.manualToggleBtn.title = canToggle ? '' : 'Nur im Stillstand moeglich';

      const isEmergency = train.state === TrainState.EMERGENCY_STOP || train.state === TrainState.EMERGENCY_BRAKING;
      this.emergencyStopBtn.classList.toggle('d-none', isEmergency);
      this.resumeBtn.classList.toggle('d-none', !isEmergency);

      this.setVisible(this.manualDriveControls, isSpawned && isManual);
    }

    this.updateTrainMeta();
  }

  private setVisible(el: HTMLElement, visible: boolean): void {
    el.classList.toggle('d-flex', visible);
    el.classList.toggle('d-none', !visible);
  }

  private async loadTrainData(trainNumber: string): Promise<void> {
    try {
      const [trainDetails, waypoints] = await Promise.all([
        getTrainDetails(trainNumber),
        getTrainWaypoints(trainNumber),
      ]);

      if (this._trainNumber !== trainNumber) return;
      this._trainDetails = trainDetails;
      this.renderTimetable(waypoints, trainDetails.followingTrainNumber);
      this.updateTrainMeta();
    } catch (error) {
      console.error('Failed to fetch train details or waypoints:', error);
      if (this._trainNumber !== trainNumber) return;
      this.timetableContainer.textContent = 'Fehler beim Laden des Fahrplans';
    }
  }

  private renderTimetable(waypoints: TrainWayPointDto[], followingTrainNumber: string | null | undefined): void {
    this.timetableContainer.innerHTML = '';

    if (waypoints.length === 0) {
      this.timetableContainer.textContent = 'No timetable available';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table table-sm table-dark table-striped';
    table.style.fontSize = 'small';

    const tbody = document.createElement('tbody');
    for (const wp of waypoints) {
      const row = document.createElement('tr');
      if (wp.processed) row.className = 'text-muted';
      row.innerHTML = `
        <td>${wp.station}</td>
        <td>${formatTimeFromIso(wp.arrivalTime, UNSET_TIME_PLACEHOLDER)}</td>
        <td>${formatTimeFromIso(wp.departureTime, UNSET_TIME_PLACEHOLDER)}</td>
      `;
      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    this.timetableContainer.appendChild(table);

    if (followingTrainNumber) {
      this.timetableContainer.appendChild(UI.createSpan('small text-secondary mt-1', `Wendet auf ${followingTrainNumber}`));
    }
  }

  private handleEmergencyStop(): void {
    this._train!.setState(TrainState.EMERGENCY_BRAKING);
  }

  private handleResume(): void {
    this._train!.setState(TrainState.RUNNING);
  }

  private handleToggleManualMode(): void {
    if (this._train!.state === TrainState.MANUAL_CONTROL) {
      void this.application.trainManager.continueTrainAfterManualControl(this._train!);
    } else {
      this._train!.startManualControl();
    }
  }

  private handleManualDrive(direction: 1 | -1): void {
    this._train?.goManualControl(direction);
  }

  private handleManualDriveStop(): void {
    if (this._train?.state !== TrainState.MANUAL_CONTROL) return;
    this._train!.speedAimed = 0;
  }

  private async handleRemove(): Promise<void> {
    await this.application.removeTrainAndReport(this._trainNumber!);
    this.hide();
  }

  private formatTrainSpeed(mps: number | null | undefined): string {
    if (mps == null || Number.isNaN(mps)) return '-';
    return `${Math.round(mps * 3.6)} km/h`;
  }

  private updateTrainMeta(): void {
    const train = this._train;
    const details = this._trainDetails;

    this.metaTypeValue.textContent = TrainDetailsPanel.TYPE_LABELS[details?.type ?? train?.type ?? ''] ?? details?.type ?? '-';
    this.metaCarsValue.textContent = String(details?.cars ?? train?.cars ?? '-');
    this.metaSpeedValue.textContent = this.formatTrainSpeed(details?.speedMax ?? train?.speedMax);
    this.metaStatusValue.textContent = train ? (TrainDetailsPanel.STATE_LABELS[train.state] ?? String(train.state)) : '-';
    this.setTitle(`${details?.category ?? ''} ${details?.trainNumber ?? ''}`);
  }
}
