import { getUpcomingTrains } from '../network/api';
import { StationTimetableEventDto } from '../network/dto';
import { Application } from '../core/application';
import { BasePanel } from './basePanel';

export class TrainOverviewPanel extends BasePanel {
  
  

  constructor(application: Application) {
    super(application, 1000);
  }

  protected getContainerId(): string { return 'trainOverviewPanel'; }
  protected getContainerClasses(): string { return super.getContainerClasses() + ' top-0 end-0'; }
  protected getContainerStyles(): Partial<CSSStyleDeclaration> {
    return {
      ...super.getContainerStyles(),
      minWidth: '630px',
      maxWidth: '900px'
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

  private async updateTrains(): Promise<void> {
    try {
      const stationId = this.application.currentStationId;
      if (!stationId) {
        console.error('No station selected');
        return;
      }
      
      const trains = await getUpcomingTrains(stationId);
      this.renderTrains(trains);
    } catch (error) {
      console.error('Failed to update trains:', error);
    }
  }

  private renderTrains(trains: StationTimetableEventDto[]): void {
    const trainsList = document.getElementById('trainsList');
    if (!trainsList) return;

    if (trains.length === 0) {
      trainsList.innerHTML = '<div class="text-muted text-center py-3">No upcoming trains</div>';
      return;
    }

    trainsList.innerHTML = this.createTrainTable(trains);
  }

  private createTrainTable(trains: StationTimetableEventDto[]): string {
    return `
      <div class="table-responsive">
        <table class="table table-dark table-sm table-borderless mb-0">
          <thead>
            <tr class="border-bottom border-secondary">
              <th>Train</th>
              <th>From</th>
              <th>To</th>
              <th>Arrival</th>
              <th>Departure</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${trains.map(train => this.createTrainTableRow(train)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  private createTrainTableRow(train: StationTimetableEventDto): string {
    const delayInfo = this.formatDelay(train.currentDelay);
    const isStoppedBySignal = this.application.trains.some(t => t.number === train.trainNumber && t.stoppedBySignal);
    
    return `
      <tr class="train-row" data-train-number="${train.trainNumber}" style="cursor:pointer">
        <td class="fw-bold ${isStoppedBySignal ? 'text-danger' : ''}">${train.category} ${train.trainNumber}</td>
        <td class="small">${train.fromStation}</td>
        <td class="small">${train.nextStation}</td>
        <td class="small">${
          train.arrival !== train.departure ? this.formatTime(train.arrival) : '---'
        }</td>
        <td class="small">${this.formatTime(train.departure)}</td>
        <td><span class="badge ${delayInfo.class}">${delayInfo.text}</span></td>
      </tr>
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

  private formatTime(timeString: string): string {
    // Convert time string to a more readable format
    if (timeString.includes(':')) {
      return timeString;
    }
    
    // If it's a full datetime string, extract just the time
    try {
      const date = new Date(timeString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeString;
    }
  }




}
