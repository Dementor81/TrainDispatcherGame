import { getUpcomingTrains } from '../network/api';
import { StationTimetableEventDto } from '../network/dto';
import { Application } from '../core/application';
import { BasePanel } from './basePanel';

export class TrainOverviewPanel extends BasePanel {
  private _updating:boolean = false;
  

  constructor(application: Application) {
    super(application, 1000);
    application.eventManager.on('simulationStateChanged', (state: string) => {
      if (state.toLowerCase() === 'running') {
        this.clearTrains();
      }
    });
  }

  private clearTrains(): void {
    const trainsList = document.getElementById('trainsList');
    if (trainsList) trainsList.innerHTML = '';
  }

  protected getContainerId(): string { return 'trainOverviewPanel'; }
  protected getContainerClasses(): string { return super.getContainerClasses(); }
  protected getContainerStyles(): Partial<CSSStyleDeclaration> {
    return {
      ...super.getContainerStyles(),
      minWidth: '630px',
      maxWidth: '900px',
      top: '0',
      right: '0',
    };
  }

  protected createContent(): HTMLDivElement {
    return this.createTrainsContainer();
  }

  private createTrainsContainer(): HTMLDivElement {
    
    
    const trainsList = document.createElement('div');
    trainsList.id = 'trainsList';
    trainsList.className = 'trains-list';
    trainsList.style.maxHeight = '300px';
    trainsList.style.overflowY = 'auto';

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
    await this.updateTrains();
  }

  private getSortTimeSeconds(train: StationTimetableEventDto): number {
    if (train.departureSeconds !== null && train.departureSeconds !== undefined) {
      return train.departureSeconds;
    }
    return train.arrivalSeconds;
  }

  private async updateTrains(): Promise<void> {
    if(this._updating) return;
    this._updating = true;
    try {

      const getSortTime = (train: StationTimetableEventDto) => train.departureSeconds ?? train.arrivalSeconds ?? 0;
      
      const trains = await getUpcomingTrains(this.application.currentStationId!);
      trains.sort((a, b) => getSortTime(a) - getSortTime(b));
      this.renderTrains(trains);
    } catch (error) {
      console.error('Failed to update trains:', error);
    }
    finally {
      this._updating = false;
    }
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
      if(!trains.find(t => t.trainNumber === trainNumber)) row.remove();
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
    table.className = 'table table-dark table-sm table-borderless mb-0';

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
    const hasArrival = train.departureSeconds !== null && train.departureSeconds !== train.arrivalSeconds;
    
    row.innerHTML = `
      <td class="fw-bold ${isStoppedBySignal ? 'text-danger' : ''}">${train.category} ${train.trainNumber}</td>
      <td class="small">${train.fromStation}</td>
      <td class="small">${train.nextStation}</td>
      <td class="small">${
        hasArrival ? this.formatSeconds(train.arrivalSeconds) : '---'
      }</td>
      <td class="small">${this.formatSeconds(train.departureSeconds)}</td>
      <td><span class="badge ${delayInfo.class}">${delayInfo.text}</span></td>
    `;
  }

  private formatDelay(delaySeconds: number): { class: string; text: string } {
    // Ignore delays below 60 seconds
    if (delaySeconds < 60) {
      return { class: 'text-success', text: 'On time' };
    }
    
    // Convert seconds to minutes
    const delayMinutes = Math.floor(delaySeconds / 60);
    
    if (delayMinutes >= 10) {
      return { class: 'text-danger', text: `+${delayMinutes}min` };
    } else {
      return { class: 'text-warning', text: `+${delayMinutes}min` };
    }
  }

  private formatSeconds(seconds?: number | null): string {
    if (seconds === null || seconds === undefined) {
      return '';
    }
    const clamped = Math.max(0, seconds);
    const hours = Math.floor(clamped / 3600) % 24;
    const minutes = Math.floor((clamped % 3600) / 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  




}
