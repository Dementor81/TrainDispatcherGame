import { fetchAvailableStations, fetchControlledStations, fetchSessionNetworkDiagram, StationInfo } from "../network/api";
import { EventManager } from "../manager/event_manager";
import { PlayerControlledStationDto } from "../network/dto";
import { StationPreviewService } from "./stationPreviewService";

export class stationSelectorDialog {
  private modal: HTMLElement | null = null;
  private networkPlan: HTMLElement | null = null;
  private previewCard: HTMLDivElement | null = null;
  private previewStatus: HTMLDivElement | null = null;
  private previewName: HTMLElement | null = null;
  private previewDescription: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private stationPlayersTableBody: HTMLElement | null = null;
  private onStationSelected: ((layout: string, playerId: string, playerName?: string) => void) | null = null;
  private playerId: string | null = null;
  private playerName: string | null = null;
  private selectedStationId = '';
  private takenStationIds: Set<string> = new Set();
  private stationsById: Map<string, StationInfo> = new Map();
  private playableStationIds: Set<string> = new Set();
  private previewUrls: Map<string, string> = new Map();
  private readonly stationPreviewService: StationPreviewService;
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
    this.networkPlan = document.getElementById('stationNetworkPlan');
    this.previewCard = document.getElementById('stationPreviewCard') as HTMLDivElement;
    this.previewStatus = document.getElementById('stationPreviewStatus') as HTMLDivElement;
    this.previewName = document.getElementById('stationPreviewName');
    this.previewDescription = document.getElementById('stationPreviewDescription');
    this.startButton = document.getElementById('startButton') as HTMLButtonElement;
    this.stationPlayersTableBody = document.getElementById('stationPlayersTableBody');
  }

  private setupEventListeners(): void {
    this.startButton?.addEventListener('click', () => this.handleStartClick());
    this.networkPlan?.addEventListener('click', (event) => this.handlePlanClick(event));

    if (this.modal) {
      this.modal.addEventListener('shown.bs.modal', () => {
        void this.loadStations();
        this.eventManager.on('playerStationChanged', this.onPlayerStationChanged);
      });
      this.modal.addEventListener('hidden.bs.modal', () => {
        this.eventManager.off('playerStationChanged', this.onPlayerStationChanged);
        this.stationPreviewService.clearCache();
        this.previewUrls.clear();
      });
    }
  }

  private async loadStations(): Promise<void> {
    if (!this.networkPlan) return;

    this.selectedStationId = '';
    this.stationsById.clear();
    this.playableStationIds.clear();
    this.setStartEnabled(false);
    this.networkPlan.replaceChildren();

    try {
      const [svgText, stations, controlledStations] = await Promise.all([
        fetchSessionNetworkDiagram(),
        fetchAvailableStations(),
        fetchControlledStations().catch((error) => {
          console.error('Failed to load controlled stations:', error);
          return [] as PlayerControlledStationDto[];
        }),
      ]);

      stations.forEach((station) => {
        if (station.id) {
          this.stationsById.set(station.id, station);
          this.playableStationIds.add(station.id);
        }
      });

      if (this.playableStationIds.size === 0) {
        this.showError();
        return;
      }

      this.inlineDiagram(svgText);
      this.markPlayableStations();
      this.renderControlledStations(controlledStations);
      this.applyTakenStyles(controlledStations);
      this.autoSelectStation();
    } catch (error) {
      console.error('Failed to load stations:', error);
      this.showError();
    }
  }

  private inlineDiagram(svgText: string): void {
    if (!this.networkPlan) return;

    const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = parsed.documentElement;
    if (svg.querySelector('parsererror') || svg.localName !== 'svg') {
      throw new Error('Invalid network diagram');
    }

    this.networkPlan.replaceChildren(document.importNode(svg, true));
  }

  private markPlayableStations(): void {
    this.forEachStation((station, stationId) => {
      const playable = this.playableStationIds.has(stationId) && station.dataset.external !== 'true';
      station.classList.toggle('playable', playable);
    });
  }

  private handlePlanClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const station = target.closest('g.station');
    if (!station || !station.classList.contains('playable')) {
      return;
    }

    const stationId = station.getAttribute('data-station-id') ?? '';
    if (stationId) {
      this.selectStation(stationId);
    }
  }

  private autoSelectStation(): void {
    const playable = this.getStationGroups().filter((station) => station.classList.contains('playable'));
    const available = playable.find((station) => {
      const stationId = station.getAttribute('data-station-id') ?? '';
      return stationId.length > 0 && !this.takenStationIds.has(stationId);
    });
    const initial = available ?? playable[0];
    const stationId = initial?.getAttribute('data-station-id') ?? '';
    if (stationId) {
      this.selectStation(stationId);
    }
  }

  private selectStation(stationId: string): void {
    this.selectedStationId = stationId;
    this.forEachStation((station, id) => {
      station.classList.toggle('selected', id === stationId);
    });
    this.updateStartButtonForStation(stationId);
    this.updatePreviewCaption(stationId);
    void this.loadPreview(stationId);
  }

  private handleStartClick(): void {
    if (!this.onStationSelected || !this.playerId) return;
    const selectedStation = this.selectedStationId;
    if (!selectedStation || this.takenStationIds.has(selectedStation)) return;
    this.onStationSelected(selectedStation, this.playerId, this.playerName!);
    this.hideModal();
  }

  public showModal(onStationSelected: (layout: string, playerId: string, playerName?: string) => void, playerId: string): void {
    this.onStationSelected = onStationSelected;
    this.playerId = playerId;
    this.loadJoinContext();

    if (this.modal) {
      const bootstrapModal = new (window as any).bootstrap.Modal(this.modal);
      bootstrapModal.show();
    }
  }

  private loadJoinContext(): void {
    const storedPlayerName = sessionStorage.getItem('playerName')?.trim() ?? '';
    this.playerName = storedPlayerName || null;
  }

  public hideModal(): void {
    if (this.modal) {
      const bootstrapModal = (window as any).bootstrap.Modal.getInstance(this.modal);
      if (bootstrapModal) {
        bootstrapModal.hide();
      }
    }
  }

  private showError(): void {
    if (this.networkPlan) {
      this.networkPlan.textContent = 'Beim Laden der Bahnhöfe ist ein Fehler aufgetreten.';
    }
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
      this.applyTakenStyles(controlledStations);
      return controlledStations;
    } catch (error) {
      console.error('Failed to load controlled stations:', error);
      this.renderControlledStations([]);
      this.applyTakenStyles([]);
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
      row.className = 'occupied';
      const playerCell = document.createElement('td');
      playerCell.textContent = entry.playerName || entry.playerId || '-';
      const stationCell = document.createElement('td');
      stationCell.textContent = this.stationDisplayName(entry.stationId || '');
      row.appendChild(playerCell);
      row.appendChild(stationCell);
      this.stationPlayersTableBody!.appendChild(row);
    });
  }

  private applyTakenStyles(controlledStations: PlayerControlledStationDto[]): void {
    const occupants = new Map(
      controlledStations
        .filter((entry) => entry.stationId)
        .map((entry) => [entry.stationId, entry.playerName || entry.playerId || ''])
    );
    this.takenStationIds = new Set(occupants.keys());

    this.forEachStation((station, stationId) => {
      const occupant = occupants.get(stationId) ?? '';
      station.classList.toggle('taken', occupant.length > 0);
      if (occupant) {
        station.setAttribute('title', occupant);
      } else {
        station.removeAttribute('title');
      }
    });
    this.updateStartButtonForStation(this.selectedStationId);
  }

  private stationDisplayName(stationId: string): string {
    if (!stationId) {
      return '-';
    }
    return this.getStationGroup(stationId)?.getAttribute('data-station-name')
      || this.stationsById.get(stationId)?.name
      || stationId;
  }

  private updateStartButtonForStation(stationId: string): void {
    if (!stationId) {
      this.setStartEnabled(false);
      return;
    }

    this.setStartEnabled(!this.takenStationIds.has(stationId));
  }

  private updatePreviewCaption(stationId: string): void {
    if (this.previewName) {
      this.previewName.textContent = this.stationDisplayName(stationId);
    }
    if (this.previewDescription) {
      this.previewDescription.textContent = this.stationsById.get(stationId)?.description?.trim() || 'Keine Beschreibung verfügbar.';
    }
  }

  private async loadPreview(stationId: string): Promise<void> {
    const cached = this.previewUrls.get(stationId);
    if (cached) {
      this.showPreviewImage(cached);
      return;
    }

    this.showPreviewLoading('Vorschau wird geladen...');
    try {
      const previewUrl = await this.stationPreviewService.loadPreview(stationId);
      this.previewUrls.set(stationId, previewUrl);
      if (this.selectedStationId !== stationId) {
        return;
      }
      this.showPreviewImage(previewUrl);
    } catch (error) {
      console.error(`Failed to generate preview for station ${stationId}:`, error);
      if (this.selectedStationId !== stationId) {
        return;
      }
      this.showPreviewError('Vorschau konnte nicht geladen werden');
    }
  }

  private showPreviewLoading(text: string): void {
    if (this.previewCard) {
      this.previewCard.style.backgroundImage = '';
    }
    if (this.previewStatus) {
      this.previewStatus.classList.remove('d-none');
      this.previewStatus.textContent = text;
    }
  }

  private showPreviewImage(imageUrl: string): void {
    if (this.previewCard) {
      this.previewCard.style.backgroundImage = `url("${imageUrl}")`;
    }
    this.previewStatus?.classList.add('d-none');
  }

  private showPreviewError(text: string): void {
    if (this.previewCard) {
      this.previewCard.style.backgroundImage = '';
    }
    if (this.previewStatus) {
      this.previewStatus.classList.remove('d-none');
      this.previewStatus.textContent = text;
    }
  }

  private getStationGroups(): SVGGElement[] {
    if (!this.networkPlan) {
      return [];
    }
    return Array.from(this.networkPlan.querySelectorAll('g.station'));
  }

  private getStationGroup(stationId: string): SVGGElement | null {
    return this.getStationGroups().find((station) => station.getAttribute('data-station-id') === stationId) ?? null;
  }

  private forEachStation(callback: (station: SVGGElement, stationId: string) => void): void {
    this.getStationGroups().forEach((station) => {
      callback(station, station.getAttribute('data-station-id') ?? '');
    });
  }
}
