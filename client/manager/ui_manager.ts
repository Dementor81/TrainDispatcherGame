import { StationSelector } from "../ui/stationSelector";
import { ControlPanel } from "../ui/controlPanel";
import { HUD } from "../ui/hud";
import { Application } from "../core/application";

export class UIManager {
    private _application: Application;
    private _controlPanel: ControlPanel | null = null;
    private _hud: HUD | null = null;

    constructor(application: Application) {
        this._application = application;
    }

    init() {
        this._controlPanel = new ControlPanel(this._application.trainManager);
        this._hud = new HUD();
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
        if (this._controlPanel) {
            this._controlPanel.show();
        }
    }

    hideControlPanel(): void {
        this._controlPanel?.hide();
    }

    toggleControlPanel(): void {
        this._controlPanel?.toggle();
    }

    showHUD(): void {
        this._hud?.show();
    }

    hideHUD(): void {
        this._hud?.hide();
    }

    updateConnectionStatus(isConnected: boolean, isReconnecting: boolean = false): void {
        this._hud?.updateConnectionStatus(isConnected, isReconnecting);
    }
}

export default UIManager;