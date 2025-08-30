import { StationSelector } from "../ui/stationSelector";
import { ControlPanel } from "../ui/controlPanel";
import { TrainOverviewPanel } from "../ui/trainOverviewPanel";
import { HUDPanel } from "../ui/hudPanel";
import NotificationModal from "../ui/notificationModal";
import ApprovalToast from "../ui/approvalToast";
import { Application } from "../core/application";

export class UIManager {
    private _application: Application;
    private _controlPanel: ControlPanel | null = null;
    private _trainOverviewPanel: TrainOverviewPanel | null = null;
    private _hud: HUDPanel | null = null;
    private _notificationModal: NotificationModal | null = null;

    constructor(application: Application) {
        this._application = application;
    }

    init() {
        this._controlPanel = new ControlPanel(this._application);
        this._hud = new HUDPanel(this._application);
        this._hud.show();
        this._controlPanel.show();
        this._notificationModal = new NotificationModal();
    }    

    start() {
        
    }

    showStationSelectionScreen(onSelect: (layout: string, playerId: string, playerName?: string) => void) {
        const modal:StationSelector = new StationSelector();
        modal.showModal((layout: string, playerId: string, playerName?: string) => {
            onSelect(layout, playerId, playerName);
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

    notifyCollision(trainNumberA: string, trainNumberB: string): void {
        const message = `Kollision zwischen Zug ${trainNumberA} und Zug ${trainNumberB}. Beide entfernt.`;
        this._notificationModal?.show(message, 'Kollision');
    }

    showApprovalToast(data: { stationId: string, fromStationId: string, trainNumber: string }): void {
        const approvalToast = new ApprovalToast(this._application);
        approvalToast.showApproval({
            stationId: data.stationId,
            fromStationId: data.fromStationId,
            trainNumber: data.trainNumber
        });
    }

    hideTrainOverviewPanel(): void {
        this._trainOverviewPanel?.hide();
    }

   




}

export default UIManager;