import { fetchAvailableLayouts, fetchLayout } from "../network/api";
import { TrackLayoutDto } from "../network/dto";

export class StationSelector {
  private modal: HTMLElement | null = null;
  private dropdown: HTMLSelectElement | null = null;
  private startButton: HTMLButtonElement | null = null;
  private onStationSelected: ((layout: string) => void) | null = null;

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
  }

  private initializeElements(): void {
    this.modal = document.getElementById('stationSelectModal');
    this.dropdown = document.getElementById('DropdownStations') as HTMLSelectElement;
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
        this.showModal((layout) => {
          console.log("Manual selection - Selected layout:", layout);
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

      // Fetch available layouts from server
      const layouts = await fetchAvailableLayouts();
      
      // Populate dropdown
      layouts.forEach(layout => {
        const option = document.createElement('option');
        option.value = layout;
        option.textContent = layout;
        this.dropdown!.appendChild(option);
      });

    } catch (error) {
      console.error('Failed to load stations:', error);
      this.dropdown.innerHTML = '<option value="">Fehler beim Laden der Bahnhöfe</option>';
    }
  }

  private async handleStartClick(): Promise<void> {
    if (!this.dropdown || !this.onStationSelected) return;

    const selectedStation = this.dropdown.value;
    if (!selectedStation) {
      alert('Bitte wählen Sie einen Bahnhof aus.');
      return;
    }

    // Call the callback with the selected station
    this.onStationSelected(selectedStation);
    
    // Hide the modal
    this.hideModal();
  }

  public showModal(onStationSelected: (layout: string) => void): void {
    this.onStationSelected = onStationSelected;
    
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