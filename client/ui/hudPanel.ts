import { EventManager } from "../manager/event_manager";
import { Application } from "../core/application";
import { BasePanel, BasePanelOptions } from "./basePanel";

export class HUDPanel extends BasePanel {
    private timeRow!: HTMLDivElement;
    private timeText!: HTMLSpanElement;
    private stateIcon!: HTMLElement;
    private connectionIcon!: HTMLElement;
    private clockIcon!: HTMLElement;

    constructor(application: Application) {
        super(application, {
            updateIntervalMs: 1000,
            width: 200
        });
        this.setupEventListeners(application.eventManager);
        this.updateConnectionStatus(this.application.signalRManager.connected, false);
        this.updateSimulationState(this.application.clientSimulation.simulationState);
        this.updateSimulationTime();
    }

    private setupEventListeners(eventManager: EventManager): void {
        eventManager.on('simulationStateChanged', (state: string) => {
            this.updateSimulationState(state);
        });
        eventManager.on('connectionStatusChanged', (state: string) => {
            const isConnected = state === 'Connected';
            const isReconnecting = state === 'Reconnecting';
            this.updateConnectionStatus(isConnected, isReconnecting);
        });
    }

    protected createContainer(options: BasePanelOptions): HTMLDivElement {
        const container = super.createContainer(options);
        container.id = "hud";
        container.className = "position-fixed p-2 base-panel text-light";
        container.style.minWidth = "200px";
        container.style.top = "0";
        container.style.left = "0";
        return container;
    }

    protected createContent(): HTMLDivElement {
        const { row, timeText, stateIcon, connectionIcon, clockIcon } = this.createTimeAndStateRow();
        this.timeRow = row;
        this.timeText = timeText;
        this.stateIcon = stateIcon;
        this.connectionIcon = connectionIcon;
        this.clockIcon = clockIcon;
        return this.timeRow;
    }

    private createTimeAndStateRow(): { row: HTMLDivElement, timeText: HTMLSpanElement, stateIcon: HTMLElement, connectionIcon: HTMLElement, clockIcon: HTMLElement } {
        const row = document.createElement("div");
        row.className = "d-flex align-items-center justify-content-start gap-3";

        const left = document.createElement("div");
        left.className = "d-flex align-items-center gap-2";

        const connectionIcon = document.createElement("i");
        connectionIcon.id = "hudConnectionIcon";
        connectionIcon.className = "bi bi-wifi-off text-danger";

        // Simulation state icon placed before the clock
        const stateIcon = document.createElement("i");
        stateIcon.id = "hudStateIcon";
        stateIcon.className = "bi bi-question-circle-fill text-secondary";

        const clockIcon = document.createElement("i");
        clockIcon.id = "hudClockIcon";
        clockIcon.className = "bi bi-clock text-secondary";

        const timeText = document.createElement("span");
        timeText.id = "hudTimeText";
        timeText.className = "fw-bold";
        timeText.textContent = "--:--:--";

        left.appendChild(connectionIcon);
        left.appendChild(stateIcon);
        left.appendChild(clockIcon);
        left.appendChild(timeText);

        row.appendChild(left);

        return { row, timeText, stateIcon, connectionIcon, clockIcon };
    }

    public updateConnectionStatus(isConnected: boolean, isReconnecting: boolean = false): void {
        if (!this.connectionIcon) return;
        if (isConnected) {
            this.connectionIcon.className = "bi bi-wifi text-success";
        } else if (isReconnecting) {
            this.connectionIcon.className = "bi bi-wifi-1 text-warning";
        } else {
            this.connectionIcon.className = "bi bi-wifi-off text-danger";
        }
    }

    protected async Updates(): Promise<void> {
        this.updateSimulationTime();
    }

    public updateSimulationTime(): void {
        const date = this.application.clientSimulation.currentSimulationTime;
        if (date == null || this.timeText == null) return;
        this.timeText.textContent = date.toLocaleTimeString();
    }

    private updateSimulationState(state: string): void {
        if (!this.stateIcon || !this.clockIcon || !this.timeText) return;
        const normalized = state.toLowerCase();
        let iconClass = "bi ";
        let textColor = "text-secondary";
        switch (normalized) {
            case "running":
                iconClass += "bi-play-fill text-success";
                textColor = "text-white";
                break;
            case "paused":
                iconClass += "bi-pause-fill text-warning";
                textColor = "text-warning";
                break;
            case "stopped":
                iconClass += "bi-stop-fill text-secondary";
                textColor = "text-secondary";
                break;
            case "error":
                iconClass += "bi-exclamation-triangle-fill text-danger";
                textColor = "text-danger";
                break;
            default:
                iconClass += "bi-question-circle-fill text-secondary";
                textColor = "text-secondary";
        }
        this.stateIcon.className = iconClass;
        this.timeText.className = `fw-bold ${textColor}`;
    }
}
