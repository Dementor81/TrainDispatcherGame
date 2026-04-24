import { getUpcomingTrains } from '../network/api';
import { StationTimetableEventDto, TrainDelayUpdatedNotificationDto, TrainRemovedNotificationDto } from '../network/dto';
import { Application } from '../core/application';
import { BasePanel } from './basePanel';
import { TrainState } from '../sim/train';
import { formatArrivalTimeForStation, formatTimeFromIso, UNSET_TIME_PLACEHOLDER } from '../utils/time';

export class TrainOverviewPanel extends BasePanel {

  private static readonly FULL_REFRESH_INTERVAL_MS = 300_000;
  private _loading: boolean = false;

  constructor(application: Application) {
    super(application, {
      updateIntervalMs: TrainOverviewPanel.FULL_REFRESH_INTERVAL_MS,
      width: 630,
      height: 300,
      top: 0,
      right: 0,
      resizable: true,
      title: 'Alle Züge',
    });
    application.eventManager.on('simulationStateChanged', (state: string) => {
      if (state.toLowerCase() === 'running') {
        this.clearTrains();
        if (this.isVisible) {
          void this.ensureCurrentStationLoaded();
        }
      }
    });
    application.eventManager.on('trainDelayUpdated', (payload: TrainDelayUpdatedNotificationDto) => {
      this.applyTrainDelayUpdate(payload);
    });
    application.eventManager.on('trainRemoved', (payload: TrainRemovedNotificationDto) => {
      this.applyTrainRemoved(payload);
    });
    application.eventManager.on('trainStateChanged', (train: any, _previousState: TrainState, nextState: TrainState) => {
      if ((nextState === TrainState.EXITING || nextState === TrainState.ENDED) && typeof train?.number === 'string') {
        this.removeTrainByNumber(train.number);
      }
    });
    application.eventManager.on('stationJoinedFull', () => {
      this.refreshAfterSessionContextChange();
    });
    application.eventManager.on('sessionContextRestored', () => {
      this.refreshAfterSessionContextChange();
    });
  }

  private clearTrains(): void {
    const trainsList = document.getElementById('trainsList');
    if (trainsList) trainsList.innerHTML = '';
  }

  protected createContent(): HTMLDivElement {
    return this.createTrainsContainer();
  }

  private createTrainsContainer(): HTMLDivElement {


    const trainsList = document.createElement('div');
    trainsList.id = 'trainsList';
    trainsList.className = 'trains-list no-drag';

    // Click on a train row opens the train details panel
    trainsList.addEventListener('click', (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      const row = el?.closest?.('tr[data-train-number]') as HTMLElement | null;
      const trainNumber = row?.dataset?.trainNumber;
      if (trainNumber) {
        this.application.eventManager.emit('trainClicked', trainNumber);
      }
    });

    return trainsList;
  }

  protected async Updates(): Promise<void> {
    await this.ensureCurrentStationLoaded();
  }

  private async ensureCurrentStationLoaded(): Promise<void> {
    const currentStationId = this.application.currentStationId?.toLowerCase();
    if (!currentStationId) {
      this.clearTrains();
      return;
    }

    if (this._loading ) {
      return;
    }

    this._loading = true;
    try {
      const trains = await getUpcomingTrains(currentStationId);
      const getSortTime = (train: StationTimetableEventDto) => {
        const time = train.departureTime ?? train.arrivalTime;
        if (!time) {
          return 0;
        }

        const parsed = new Date(time).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
      };
      trains.sort((a, b) => getSortTime(a) - getSortTime(b));
      this.renderTrains(trains);
    } catch (error) {
      console.error('Failed to load initial trains:', error);
    } finally {
      this._loading = false;
    }
  }

  private refreshAfterSessionContextChange(): void {
    if (!this.isVisible) {
      return;
    }
    void this.ensureCurrentStationLoaded();
  }

  private applyTrainDelayUpdate(payload: TrainDelayUpdatedNotificationDto): void {
    if (!payload || typeof payload.trainNumber !== 'string' || typeof payload.currentDelay !== 'number') {
      console.warn('TrainOverviewPanel: Ignoring invalid trainDelayUpdated payload.', payload);
      return;
    }

    const updated = this.updateTrainDelayRow(payload.trainNumber, payload.currentDelay);
    if (!updated) {
      console.debug(`TrainOverviewPanel: No matching row for delay update ${payload.trainNumber}.`);
    }
  }

  private applyTrainRemoved(payload: TrainRemovedNotificationDto): void {
    if (!payload || typeof payload.trainNumber !== 'string') {
      return;
    }

    this.removeTrainByNumber(payload.trainNumber);
  }

  private removeTrainByNumber(trainNumber: string): void {
    this.removeTrainRow(trainNumber);
  }

  private removeTrainRow(trainNumber: string): void {
    const trainsList = document.getElementById('trainsList');
    if (!trainsList) return;

    const tbody = trainsList.querySelector<HTMLTableSectionElement>('tbody');
    if (!tbody) return;

    const row = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr[data-train-number]'))
      .find((candidate) => candidate.dataset.trainNumber === trainNumber);

    if (!row) return;
    row.remove();

    if (tbody.querySelectorAll('tr[data-train-number]').length === 0) {
      trainsList.innerHTML = '<div class="text-muted text-center py-3">keine Züge vorhanden</div>';
    }
  }

  private updateTrainDelayRow(trainNumber: string, delaySeconds: number): boolean {
    const trainsList = document.getElementById('trainsList');
    if (!trainsList) return false;

    const row = Array.from(trainsList.querySelectorAll<HTMLTableRowElement>('tr[data-train-number]'))
      .find((candidate) => candidate.dataset.trainNumber === trainNumber);
    if (!row) return false;

    const delayBadge = row.querySelector<HTMLElement>('[data-delay-badge="true"]');
    if (!delayBadge) return false;

    const delayInfo = this.formatDelay(delaySeconds);
    delayBadge.className = `badge ${delayInfo.class}`;
    delayBadge.textContent = delayInfo.text;
    return true;
  }

  private renderTrains(trains: StationTimetableEventDto[]): void {
    const trainsList = document.getElementById('trainsList');
    if (!trainsList) return;

    if (trains.length === 0) {
      trainsList.innerHTML = '<div class="text-muted text-center py-3">keine Züge vorhanden</div>';
      return;
    }

    const tbody = this.ensureTrainTable(trainsList);
    if (!tbody) return;

    //first lets collect all existing rows by their train number
    //that should normally be all trains, since we dont add trains dynamically
    const existingRows = new Map<string, HTMLTableRowElement>();
    tbody.querySelectorAll<HTMLTableRowElement>('tr[data-train-number]').forEach((row) => {
      const number = row.dataset.trainNumber;
      if (number) {
        existingRows.set(number, row);
      }
    });

    for (const train of trains) {
      let row = existingRows.get(train.trainNumber);
      if (!row) {
        row = document.createElement('tr');
        row.className = 'train-row';
        row.dataset.trainNumber = train.trainNumber;
        row.style.cursor = 'pointer';
        tbody.appendChild(row);
      }
      this.updateTrainRow(row, train);
    }

    for (const [trainNumber, row] of existingRows) {
      if (!trains.find(t => t.trainNumber === trainNumber)) row.remove();
    }
  }

  private ensureTrainTable(trainsList: HTMLElement): HTMLTableSectionElement | null {
    const existingTableBody = trainsList.querySelector<HTMLTableSectionElement>('tbody');
    if (existingTableBody) {
      return existingTableBody;
    }

    trainsList.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'table-responsive';
    const table = document.createElement('table');
    table.style.width = 'stretch';
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr class="border-bottom border-secondary">
        <th>Zug</th>
        <th>Von</th>
        <th>Nach</th>
        <th>Ankunft</th>
        <th>Abfahrt</th>
        <th>Status</th>
      </tr>
    `;

    const tbody = document.createElement('tbody');

    table.appendChild(thead);
    table.appendChild(tbody);
    wrapper.appendChild(table);
    trainsList.appendChild(wrapper);

    return tbody;
  }

  private updateTrainRow(row: HTMLTableRowElement, train: StationTimetableEventDto): void {
    const delayInfo = this.formatDelay(train.currentDelay);
    const isStoppedBySignal = this.application.trains.some(t => t.number === train.trainNumber && t.stoppedBySignal);

    row.innerHTML = `
      <td class="small fw-bold ${isStoppedBySignal ? 'text-danger' : ''}">${train.category} ${train.trainNumber}</td>
      <td class="small">${train.fromStation}</td>
      <td class="small">${train.nextStation}</td>
      <td class="small">${formatArrivalTimeForStation(train.arrivalTime, train.departureTime, UNSET_TIME_PLACEHOLDER)}</td>
      <td class="small">${formatTimeFromIso(train.departureTime, UNSET_TIME_PLACEHOLDER)}</td>
      <td><span data-delay-badge="true" class="badge ${delayInfo.class}">${delayInfo.text}</span></td>
    `;
  }

  private formatDelay(delaySeconds: number): { class: string; text: string } {
    if (!Number.isFinite(delaySeconds)) {
      return { class: 'text-success', text: '0min' };
    }

    const absSec = Math.abs(delaySeconds);
    if (absSec < 60) {
      return { class: 'text-success', text: '0min' };
    }

    const minutes = Math.trunc(delaySeconds / 60);
    if (minutes < 0) {
      return { class: 'text-success', text: `${minutes}min` };
    }
    if (minutes >= 10) {
      return { class: 'text-danger', text: `+${minutes}min` };
    }
    return { class: 'text-warning', text: `+${minutes}min` };
  }

}
