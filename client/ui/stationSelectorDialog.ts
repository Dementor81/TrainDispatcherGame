import { fetchAvailableStations, fetchControlledStations } from "../network/api";
import { Tools } from "../core/utils";
import { EventManager } from "../manager/event_manager";
import { PlayerControlledStationDto } from "../network/dto";

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
  private previewCache: Map<string, string> = new Map();
  private previewLoadingStations: Set<string> = new Set();
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
        this.renderStatusSlide('Fehler.', 'Beim Laden der Bahnhöfe ist ein Fehler aufgetreten.');
        return;
      }

      stations.forEach((station, index) => {
        const indicator = document.createElement('button');
        indicator.type = 'button';
        indicator.setAttribute('data-bs-target', '#stationCarousel');
        indicator.setAttribute('data-bs-slide-to', index.toString());
        indicator.setAttribute('aria-label', `Station ${index + 1}`);
        if (index === 0) {
          indicator.classList.add('active');
          indicator.setAttribute('aria-current', 'true');
        }
        indicator.dataset.stationId = (station.id || '').toLowerCase();
        this.carouselIndicators!.appendChild(indicator);
        this.stationOrder.push((station.id || '').toLowerCase());

        const item = document.createElement('div');
        item.className = `carousel-item${index === 0 ? ' active' : ''}`;
        item.dataset.stationId = station.id;

        const card = document.createElement('div');
        card.className = 'station-carousel-slide d-flex flex-column justify-content-end';
        card.style.backgroundImage = '';

        const previewStatus = document.createElement('div');
        previewStatus.className = 'station-preview-status';
        previewStatus.textContent = 'Vorschau bereit zum Laden';

        const caption = document.createElement('div');
        caption.className = 'station-carousel-caption text-center';

        const title = document.createElement('h5');
        title.className = 'mb-2';
        title.textContent = station.name || station.id;

        const description = document.createElement('p');
        description.className = 'mb-0';
        description.textContent = station.description?.trim() || 'Keine Beschreibung verfügbar.';

        caption.appendChild(title);
        caption.appendChild(description);
        card.appendChild(previewStatus);
        card.appendChild(caption);
        item.appendChild(card);
        this.carouselInner!.appendChild(item);
      });

      this.updateStationIndicators(controlledStations);
      this.updateStartButtonForCurrentSelection();
      const activeItem = this.carouselInner.querySelector('.carousel-item.active') as HTMLElement | null;
      if (activeItem) {
        void this.loadPreviewForSlideItem(activeItem);
      }
    } catch (error) {
      console.error('Failed to load stations:', error);
      this.renderStatusSlide('Fehler.', 'Beim Laden der Bahnhöfe ist ein Fehler aufgetreten.');
    }
  }

  private handleStartClick(): void {
    if (!this.onStationSelected) return;
    const selectedStation = this.getSelectedStationId();
    // Call the callback with the selected station and player GUID, passing playerName optionally
    const playerId = this.getOrCreateClientId();
    this.onStationSelected(selectedStation, playerId, this.playerName! );
    
    // Hide the modal
    this.hideModal();
  }

  public showModal(onStationSelected: (layout: string, playerId: string, playerName?: string) => void): void {
    this.onStationSelected = onStationSelected;
    this.loadJoinContext();
    this.updateJoinContextDisplay();
    
    // Use Bootstrap's modal API to show the modal
    if (this.modal) {
      const bootstrapModal = new (window as any).bootstrap.Modal(this.modal);
      bootstrapModal.show();
    }
  }

  private getOrCreateClientId(): string {
    // Generate a fresh GUID per app instance (no persistence)
    if ((crypto as any).randomUUID) {
      return (crypto as any).randomUUID();
    }
    return Tools.generateGuid();
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

  private renderStatusSlide(title: string, description: string): void {
    if (!this.carouselInner) {
      return;
    }

    const item = document.createElement('div');
    item.className = 'carousel-item active';

    const card = document.createElement('div');
    card.className = 'station-carousel-slide d-flex flex-column justify-content-center';

    const caption = document.createElement('div');
    caption.className = 'station-carousel-caption text-center';

    const heading = document.createElement('h5');
    heading.className = 'mb-2';
    heading.textContent = title;

    const message = document.createElement('p');
    message.className = 'mb-0';
    message.textContent = description;

    caption.appendChild(heading);
    caption.appendChild(message);
    card.appendChild(caption);
    item.appendChild(card);
    this.carouselInner.innerHTML = '';
    this.carouselInner.appendChild(item);
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
        .map((entry) => (entry.stationId || '').toLowerCase())
        .filter((stationId) => stationId.length > 0)
    );
    this.takenStationIds = takenStations;

    const indicators = Array.from(this.carouselIndicators.querySelectorAll('button[data-bs-slide-to]')) as HTMLButtonElement[];
    indicators.forEach((indicator, index) => {
      const stationId = (this.stationOrder[index] || indicator.dataset.stationId || '').toLowerCase();
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
    const normalizedStationId = (stationId || '').toLowerCase();
    if (!normalizedStationId) {
      this.setStartEnabled(false);
      return;
    }

    this.setStartEnabled(!this.takenStationIds.has(normalizedStationId));
  }





  private async loadPreviewForSlideItem(slideItem: HTMLElement): Promise<void> {
    const stationId = slideItem.dataset.stationId?.trim() ?? '';
    if (!stationId) {
      return;
    }

    const previewCard = slideItem.querySelector('.station-carousel-slide') as HTMLDivElement | null;
    const previewStatus = slideItem.querySelector('.station-preview-status') as HTMLDivElement | null;
    if (!previewCard || !previewStatus) {
      return;
    }

    const cachedPreview = this.previewCache.get(stationId);
    if (cachedPreview) {
      this.showPreviewImage(previewCard, previewStatus, cachedPreview);
      return;
    }

    if (this.previewLoadingStations.has(stationId)) {
      this.showPreviewLoading(previewStatus, 'Vorschau wird geladen...');
      return;
    }

    this.previewLoadingStations.add(stationId);
    this.showPreviewLoading(previewStatus, 'Vorschau wird geladen...');
    try {
      const previewUrl = await this.generateStationPreview(stationId);
      this.previewCache.set(stationId, previewUrl);
      this.showPreviewImage(previewCard, previewStatus, previewUrl);
    } catch (error) {
      console.error(`Failed to generate preview for station ${stationId}:`, error);
      this.showPreviewError(previewCard, previewStatus, 'Vorschau konnte nicht geladen werden');
    } finally {
      this.previewLoadingStations.delete(stationId);
    }
  }

  private showPreviewLoading(previewStatus: HTMLDivElement, text: string): void {
    previewStatus.classList.remove('d-none');
    previewStatus.textContent = text;
  }

  private showPreviewImage(previewCard: HTMLDivElement, previewStatus: HTMLDivElement, imageUrl: string): void {
    previewCard.style.backgroundImage = `url("${imageUrl}")`;
    previewStatus.classList.add('d-none');
  }

  private showPreviewError(previewCard: HTMLDivElement, previewStatus: HTMLDivElement, text: string): void {
    previewCard.style.backgroundImage = '';
    previewStatus.classList.remove('d-none');
    previewStatus.textContent = text;
  }

  private async generateStationPreview(stationId: string): Promise<string> {
    const app = (window as any).app as any;
    if (!app?.trackLayoutManager || !app?.renderer) {
      throw new Error('Preview renderer is not ready');
    }

    await app.trackLayoutManager.loadTrackLayout(stationId);
    await this.waitForNextFrame();
    return app.renderer.capturePreview();
  }

  private waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
} 