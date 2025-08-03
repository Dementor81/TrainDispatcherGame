import { fetchAvailableStations, StationInfo } from "../network/api";

export class StationSelector {
  private modal: HTMLElement | null = null;
  private dropdown: HTMLSelectElement | null = null;
  private playerNameInput: HTMLInputElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private onStationSelected: ((layout: string, playerId: string) => void) | null = null;

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
  }

  private initializeElements(): void {
    this.modal = document.getElementById('stationSelectModal');
    this.dropdown = document.getElementById('DropdownStations') as HTMLSelectElement;
    this.playerNameInput = document.getElementById('playerNameInput') as HTMLInputElement;
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
    const manualButton = document.getElementById('showStationSelector');
    if (manualButton) {
      manualButton.addEventListener('click', () => {
        this.showModal((layout, playerId) => {
          console.log("Manual selection - Selected layout:", layout, "Player ID:", playerId);
          // TODO: Initialize the simulation with the selected layout
        });
      });
    }
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
        option.textContent = station.title;
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
    if (!this.dropdown || !this.playerNameInput || !this.onStationSelected) return;

    const selectedStation = this.dropdown.value;
    let playerName = this.playerNameInput.value.trim();

    if (!selectedStation) {
      alert('Bitte wählen Sie einen Bahnhof aus.');
      return;
    }

    // If no player name was entered, set it to "player one"
    if (!playerName) {
      playerName = "player one";
    }

    // Call the callback with the selected station and player ID
    this.onStationSelected(selectedStation, playerName);
    
    // Hide the modal
    this.hideModal();
  }

  public showModal(onStationSelected: (layout: string, playerId: string) => void): void {
    this.onStationSelected = onStationSelected;
    
    // Clear the player name input
    if (this.playerNameInput) {
      this.playerNameInput.value = '';
    }
    
    // Use Bootstrap's modal API to show the modal
    if (this.modal) {
      const bootstrapModal = new (window as any).bootstrap.Modal(this.modal);
      bootstrapModal.show();
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