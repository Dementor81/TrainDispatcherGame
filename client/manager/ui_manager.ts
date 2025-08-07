import { StationSelector } from "../ui/stationSelector";
import { ControlPanel } from "../ui/controlPanel";
import { TrainOverviewPanel } from "../ui/trainOverviewPanel";
import { HUD } from "../ui/hud";
import { Application } from "../core/application";

export class UIManager {
    private _application: Application;
    private _controlPanel: ControlPanel | null = null;
    private _trainOverviewPanel: TrainOverviewPanel | null = null;
    private _hud: HUD | null = null;

    constructor(application: Application) {
        this._application = application;
    }

    init() {
        this._controlPanel = new ControlPanel(this._application);
        this._hud = new HUD();
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



    showTrainOverviewPanel(): void {
        if (!this._trainOverviewPanel) {
            this._trainOverviewPanel = new TrainOverviewPanel(this._application);
        }
        this._trainOverviewPanel.show();
    }

    hideTrainOverviewPanel(): void {
        this._trainOverviewPanel?.hide();
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