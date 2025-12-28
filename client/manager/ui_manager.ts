import { StationSelector } from "../ui/stationSelector";
import { ControlPanel } from "../ui/controlPanel";
import { TrainOverviewPanel } from "../ui/trainOverviewPanel";
import { TestingPanel } from "../ui/testingPanel";
import { HUDPanel } from "../ui/hudPanel";
import { TrainDetailsPanel } from "../ui/trainDetailsPanel";
import NotificationModal from "../ui/notificationModal";
import ApprovalToast from "../ui/approvalToast";
import { Application } from "../core/application";
import { EventManager } from "./event_manager";
import Tools from "../core/utils";

export class UIManager {
    private _application: Application;
    private _eventManager: EventManager;
    private _controlPanel: ControlPanel | null = null;
    private _trainOverviewPanel: TrainOverviewPanel | null = null;
    private _trainDetailsPanel: TrainDetailsPanel | null = null;
    private _testingPanel: TestingPanel | null = null;
    private _hud: HUDPanel | null = null;
    private _notificationModal: NotificationModal | null = null;

    constructor(application: Application, eventManager: EventManager) {
        this._application = application;
        this._eventManager = eventManager;
    }

    init() {
        this._controlPanel = new ControlPanel(this._application);
        this._hud = new HUDPanel(this._application);
        this._hud.show();
        this._controlPanel.show();
        this._notificationModal = new NotificationModal();

        // Train clicked (overview list or playfield)
        this._eventManager.on('trainClicked', (trainNumber: string) => {
            this.showTrainDetailsPanel(trainNumber);
        });

        // Approval requests from server
        this._eventManager.on('approvalRequested', (data: { stationId: string, fromStationId: string, trainNumber: string }) => {
            this.showApprovalToast(data);
        });
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

    showTrainDetailsPanel(trainNumber: string): void {
        if (!this._trainDetailsPanel) {
            this._trainDetailsPanel = new TrainDetailsPanel(this._application);
        }
        this._trainDetailsPanel.setTrainNumber(trainNumber);
        this._trainDetailsPanel.show();
    }

    showTestingPanel(): void {
        if (!Tools.isQueryParamTrue('testing')) {
            return;
        }
        if (!this._testingPanel) {
            this._testingPanel = new TestingPanel(this._application);
        }
        this._testingPanel.show();
    }

    notifyCollision(trainNumberA: string, trainNumberB: string): void {
        const message = `Kollision zwischen Zug ${trainNumberA} und Zug ${trainNumberB}. Beide entfernt.`;
        this._notificationModal?.show(message, 'Kollision');
    }

    notifyDerailment(trainNumber: string, switchId?: number): void {
        const details = switchId !== undefined ? ` an Weiche ${switchId}` : '';
        const message = `Entgleisung von Zug ${trainNumber}${details}. Zug entfernt.`;
        this._notificationModal?.show(message, 'Entgleisung');
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