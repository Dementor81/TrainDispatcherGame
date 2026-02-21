import { fetchAvailableStations } from "../network/api";
import { Tools } from "../core/utils";

export class StationSelector {
  private modal: HTMLElement | null = null;
  private dropdown: HTMLSelectElement | null = null;
  private selectedPlayerName: HTMLElement | null = null;
  private selectedGameCode: HTMLElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private onStationSelected: ((layout: string, playerId: string, playerName?: string) => void) | null = null;
  private playerName: string | null = null;
  private gameCode: string | null = null;

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
  }

  private initializeElements(): void {
    this.modal = document.getElementById('stationSelectModal');
    this.dropdown = document.getElementById('DropdownStations') as HTMLSelectElement;
    this.selectedPlayerName = document.getElementById('selectedPlayerName');
    this.selectedGameCode = document.getElementById('selectedGameCode');
    this.startButton = document.getElementById('startButton') as HTMLButtonElement;
  }

  private setupEventListeners(): void {
    if (this.startButton) {
      this.startButton.addEventListener('click', () => this.handleStartClick());
    }

    // Show modal when it's shown
    if (this.modal) {
      this.modal.addEventListener('shown.bs.modal', () => this.loadStations());
    }

    // Manual trigger button
    
  }

  private async loadStations(): Promise<void> {
    if (!this.dropdown) return;

    try {
      // Clear existing options
      this.dropdown.innerHTML = '<option value="">Bahnhof auswählen...</option>';

      // Fetch available stations from server
      const stations = await fetchAvailableStations();
      
      // Populate dropdown
      stations.forEach(station => {
        const option = document.createElement('option');
        option.value = station.id;
        option.textContent = station.id;
        this.dropdown!.appendChild(option);
      });

      if (stations.length > 0) {
        this.dropdown.value = stations[0].id;
      }

    } catch (error) {
      console.error('Failed to load stations:', error);
      this.dropdown.innerHTML = '<option value="">Fehler beim Laden der Bahnhöfe</option>';
    }
  }

  private handleStartClick(): void {
    if (!this.dropdown || !this.onStationSelected) return;

    const selectedStation = this.dropdown.value;

    if (!selectedStation) {
      alert('Bitte wählen Sie einen Bahnhof aus.');
      return;
    }

    // Call the callback with the selected station and player GUID, passing playerName optionally
    const playerId = this.getOrCreateClientId();
    this.onStationSelected(selectedStation, playerId, this.playerName || undefined);
    
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
    const storedGameCode = sessionStorage.getItem('gameCode')?.trim() ?? '';

    this.playerName = storedPlayerName || null;
    this.gameCode = storedGameCode || null;
  }

  private updateJoinContextDisplay(): void {
    if (this.selectedPlayerName) {
      this.selectedPlayerName.textContent = this.playerName ?? '-';
    }

    if (this.selectedGameCode) {
      this.selectedGameCode.textContent = this.gameCode ?? '-';
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
} 