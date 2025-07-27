import { StationSelector } from "../ui/stationSelector";
import { ControlPanel } from "../ui/controlPanel";
import { Application } from "../core/application";

export class UIManager {
    private _application: Application;
    private _controlPanel: ControlPanel | null = null;

    constructor(application: Application) {
        this._application = application;
    }

    init() {
        this._controlPanel = new ControlPanel();
        this.setupControlPanelToggle();
    }

    private setupControlPanelToggle(): void {
        const toggleButton = document.getElementById('toggleControlPanel');
        if (toggleButton && this._controlPanel) {
            toggleButton.addEventListener('click', () => {
                this._controlPanel?.toggle();
            });
        }
    }

    start() {
        
    }

    showStationSelectionScreen(onSelect: (layout: string, playerId: string) => void) {
        const modal:StationSelector = new StationSelector();
        modal.showModal((layout: string, playerId: string) => {
            onSelect(layout, playerId);
         });
    }

    showControlPanel(): void {
        this._controlPanel?.show();
    }

    hideControlPanel(): void {
        this._controlPanel?.hide();
    }

    toggleControlPanel(): void {
        this._controlPanel?.toggle();
    }
}

export default UIManager;