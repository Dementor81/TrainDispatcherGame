import { fetchAvailableStations, fetchControlledStations } from "../network/api";
import { EventManager } from "../manager/event_manager";
import { PlayerControlledStationDto } from "../network/dto";
import { StationPreviewService } from "./stationPreviewService";

type StationPreviewElements = {
  card: HTMLDivElement;
  status: HTMLDivElement;
};

export class stationSelectorDialog {
  private modal: HTMLElement | null = null;
  private carousel: HTMLElement | null = null;
  private carouselInner: HTMLElement | null = null;
  private carouselIndicators: HTMLElement | null = null;
  private carouselPrev: HTMLButtonElement | null = null;
  private carouselNext: HTMLButtonElement | null = null;
  private selectedPlayerName: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private stationPlayersTableBody: HTMLElement | null = null;
  private onStationSelected: ((layout: string, playerId: string, playerName?: string) => void) | null = null;
  private playerId: string | null = null;
  private readonly stationPreviewService: StationPreviewService;
  private stationOrder: string[] = [];
  private takenStationIds: Set<string> = new Set();
  private playerName: string | null = null;
  private readonly eventManager: EventManager;
  private readonly onPlayerStationChanged = (): void => {
    if (this.isModalVisible()) {
      void this.refreshControlledStations();
    }
  };

  constructor(eventManager: EventManager) {
    this.eventManager = eventManager;
    this.stationPreviewService = new StationPreviewService();
    this.initializeElements();
    this.setupEventListeners();
  }

  private initializeElements(): void {
    this.modal = document.getElementById('stationSelectModal');
    this.carousel = document.getElementById('stationCarousel');
    this.carouselInner = document.getElementById('stationCarouselInner');
    this.carouselIndicators = document.getElementById('stationCarouselIndicators');
    this.carouselPrev = document.getElementById('stationCarouselPrev') as HTMLButtonElement;
    this.carouselNext = document.getElementById('stationCarouselNext') as HTMLButtonElement;
    this.selectedPlayerName = document.getElementById('selectedPlayerName');
    this.startButton = document.getElementById('startButton') as HTMLButtonElement;
    this.stationPlayersTableBody = document.getElementById('stationPlayersTableBody');
  }

  private setupEventListeners(): void {
    if (this.startButton) {
      this.startButton.addEventListener('click', () => this.handleStartClick());
    }

    // Show modal when it's shown
    if (this.modal) {
      this.modal.addEventListener('shown.bs.modal', () => {
        void this.loadStations();
        this.eventManager.on('playerStationChanged', this.onPlayerStationChanged);
      });
      this.modal.addEventListener('hidden.bs.modal', () => {
        this.eventManager.off('playerStationChanged', this.onPlayerStationChanged);
        this.stationPreviewService.clearCache();
      });
    }

    if (this.carousel) {
      this.carousel.addEventListener('slide.bs.carousel', (event: Event) => {
        const slideEvent = event as any;
        const targetItem = slideEvent.relatedTarget as HTMLElement | null;
        if (targetItem) {
          this.updateStartButtonForStation(targetItem.dataset.stationId ?? '');
          void this.loadPreviewForSlideItem(targetItem);
          return;
        }
      });
    }
  }

  private async loadStations(): Promise<void> {
    if (!this.carouselInner || !this.carouselIndicators) return;

    try {
      this.carouselInner.innerHTML = '';
      this.carouselIndicators.innerHTML = '';
      this.stationOrder = [];
      this.setStartEnabled(false);

      const stations = await fetchAvailableStations();
      const controlledStations = await this.refreshControlledStations();

      if (stations.length === 0) {
        this.ShowError();
        return;
      }

      const indicatorsFragment = document.createDocumentFragment();
      const slidesFragment = document.createDocumentFragment();

      stations.forEach((station, index) => {
        const stationId = station.id || '';
        const indicator = this.createCarouselIndicator(index, stationId);
        const slide = this.createStationSlide(station.id, station.name, station.description, index === 0);
        indicatorsFragment.appendChild(indicator);
        slidesFragment.appendChild(slide);
        this.stationOrder.push(stationId);
      });

      this.carouselIndicators.appendChild(indicatorsFragment);
      this.carouselInner.appendChild(slidesFragment);

      this.updateStationIndicators(controlledStations);
      this.updateStartButtonForCurrentSelection();
      const activeItem = this.carouselInner.querySelector('.carousel-item.active') as HTMLElement | null;
      if (activeItem) {
        void this.loadPreviewForSlideItem(activeItem);
      }
    } catch (error) {
      console.error('Failed to load stations:', error);
      this.ShowError();
    }
  }

  private handleStartClick(): void {
    if (!this.onStationSelected || !this.playerId) return;
    const selectedStation = this.getSelectedStationId();
    this.onStationSelected(selectedStation, this.playerId, this.playerName!);
    
    // Hide the modal
    this.hideModal();
  }

  public showModal(onStationSelected: (layout: string, playerId: string, playerName?: string) => void, playerId: string): void {
    this.onStationSelected = onStationSelected;
    this.playerId = playerId;
    this.loadJoinContext();
    this.updateJoinContextDisplay();
    
    // Use Bootstrap's modal API to show the modal
    if (this.modal) {
      const bootstrapModal = new (window as any).bootstrap.Modal(this.modal);
      bootstrapModal.show();
    }
  }

  private loadJoinContext(): void {
    const storedPlayerName = sessionStorage.getItem('playerName')?.trim() ?? '';
    this.playerName = storedPlayerName || null;
  }

  private updateJoinContextDisplay(): void {
    if (this.selectedPlayerName) {
      this.selectedPlayerName.textContent = this.playerName ?? '-';
    }
  }

  public hideModal(): void {
    if (this.modal) {
      const bootstrapModal = (window as any).bootstrap.Modal.getInstance(this.modal);
      if (bootstrapModal) {
        bootstrapModal.hide();
      }
    }
  }

  private getSelectedStationId(): string {
    if (!this.carouselInner) {
      return '';
    }

    const activeItem = this.carouselInner.querySelector('.carousel-item.active') as HTMLElement | null;
    return activeItem?.dataset.stationId ?? '';
  }

  private ShowError(): void {
    if (!this.carouselInner) {
      return;
    }
    this.carouselInner.innerHTML = 'Beim Laden der Bahnhöfe ist ein Fehler aufgetreten.';
    
    this.setStartEnabled(false);
  }

  private setStartEnabled(enabled: boolean): void {
    if (this.startButton) {
      this.startButton.disabled = !enabled;
    }
  }

  private async refreshControlledStations(): Promise<PlayerControlledStationDto[]> {
    try {
      const controlledStations = await fetchControlledStations();
      this.renderControlledStations(controlledStations);
      this.updateStationIndicators(controlledStations);
      return controlledStations;
    } catch (error) {
      console.error('Failed to load controlled stations:', error);
      this.renderControlledStations([]);
      this.updateStationIndicators([]);
      return [];
    }
  }

  private isModalVisible(): boolean {
    return this.modal?.classList.contains('show') ?? false;
  }

  private renderControlledStations(controlledStations: PlayerControlledStationDto[]): void {
    if (!this.stationPlayersTableBody) {
      return;
    }

    this.stationPlayersTableBody.innerHTML = '';
    if (!controlledStations || controlledStations.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 2;
      cell.className = 'text-muted';
      cell.textContent = 'Keine anderen Spieler verbunden';
      row.appendChild(cell);
      this.stationPlayersTableBody.appendChild(row);
      return;
    }

    controlledStations.forEach((entry) => {
      const row = document.createElement('tr');
      const playerCell = document.createElement('td');
      playerCell.textContent = entry.playerName || entry.playerId || '-';
      const stationCell = document.createElement('td');
      stationCell.textContent = entry.stationId || '-';
      row.appendChild(playerCell);
      row.appendChild(stationCell);
      this.stationPlayersTableBody!.appendChild(row);
    });
  }

  private updateStationIndicators(controlledStations: PlayerControlledStationDto[]): void {
    if (!this.carouselIndicators) {
      return;
    }

    const takenStations = new Set(
      controlledStations
        .map((entry) => entry.stationId || '')
        .filter((stationId) => stationId.length > 0)
    );
    this.takenStationIds = takenStations;

    const indicators = Array.from(this.carouselIndicators.querySelectorAll('button[data-bs-slide-to]')) as HTMLButtonElement[];
    indicators.forEach((indicator, index) => {
      const stationId = this.stationOrder[index] || indicator.dataset.stationId || '';
      const isTaken = stationId.length > 0 && takenStations.has(stationId);
      indicator.classList.toggle('station-indicator-taken', isTaken);
      indicator.classList.toggle('station-indicator-available', !isTaken);
    });

    this.updateStartButtonForCurrentSelection();
  }

  private updateStartButtonForCurrentSelection(): void {
    this.updateStartButtonForStation(this.getSelectedStationId());
  }

  private updateStartButtonForStation(stationId: string): void {
    if (!stationId) {
      this.setStartEnabled(false);
      return;
    }

    this.setStartEnabled(!this.takenStationIds.has(stationId));
  }





  private async loadPreviewForSlideItem(slideItem: HTMLElement): Promise<void> {
    const stationId = slideItem.dataset.stationId ?? '';
    if (!stationId) {
      return;
    }

    const preview = this.getPreviewElements(slideItem);
    if (!preview) {
      return;
    }

    if (this.hasRenderedPreview(preview)) {
      return;
    }

    this.showPreviewLoading(preview, 'Vorschau wird geladen...');
    try {
      const previewUrl = await this.stationPreviewService.loadPreview(stationId);
      this.showPreviewImage(preview, previewUrl);
    } catch (error) {
      console.error(`Failed to generate preview for station ${stationId}:`, error);
      this.showPreviewError(preview, 'Vorschau konnte nicht geladen werden');
    }
  }

  private getPreviewElements(slideItem: HTMLElement): StationPreviewElements | null {
    const card = slideItem.querySelector('.station-carousel-slide') as HTMLDivElement | null;
    const status = slideItem.querySelector('.station-preview-status') as HTMLDivElement | null;
    if (!card || !status) {
      return null;
    }

    return { card, status };
  }

  private showPreviewLoading(preview: StationPreviewElements, text: string): void {
    preview.status.classList.remove('d-none');
    preview.status.textContent = text;
  }

  private showPreviewImage(preview: StationPreviewElements, imageUrl: string): void {
    preview.card.style.backgroundImage = `url("${imageUrl}")`;
    preview.status.classList.add('d-none');
  }

  private showPreviewError(preview: StationPreviewElements, text: string): void {
    preview.card.style.backgroundImage = '';
    preview.status.classList.remove('d-none');
    preview.status.textContent = text;
  }

  private hasRenderedPreview(preview: StationPreviewElements): boolean {
    return preview.card.style.backgroundImage.length > 0;
  }

  private createCarouselIndicator(index: number, stationId: string): HTMLButtonElement {
    const indicator = document.createElement('button');
    indicator.type = 'button';
    indicator.setAttribute('data-bs-target', '#stationCarousel');
    indicator.setAttribute('data-bs-slide-to', index.toString());
    indicator.setAttribute('aria-label', `Station ${index + 1}`);
    if (index === 0) {
      indicator.classList.add('active');
      indicator.setAttribute('aria-current', 'true');
    }
    indicator.dataset.stationId = stationId;
    return indicator;
  }

  private createStationSlide(stationId: string, stationName: string | undefined, stationDescription: string | undefined, isActive: boolean): HTMLDivElement {
    const item = document.createElement('div');
    item.className = `carousel-item${isActive ? ' active' : ''}`;
    item.dataset.stationId = stationId;

    const card = document.createElement('div');
    card.className = 'station-carousel-slide';

    const previewStatus = document.createElement('div');
    previewStatus.className = 'station-preview-status';
    previewStatus.textContent = 'Vorschau bereit zum Laden';

    const caption = document.createElement('div');
    caption.className = 'station-carousel-caption text-center';

    const title = document.createElement('h5');
    title.className = 'mb-2';
    title.textContent = stationName || stationId;

    const description = document.createElement('p');
    description.className = 'mb-0';
    description.textContent = stationDescription?.trim() || 'Keine Beschreibung verfügbar.';

    caption.appendChild(title);
    caption.appendChild(description);
    card.appendChild(previewStatus);
    card.appendChild(caption);
    item.appendChild(card);

    return item;
  }
}