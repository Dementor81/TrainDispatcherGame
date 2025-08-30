import Application from "../core/application";

export type ApprovalRequest = {
    stationId: string; // the station asked to approve
    fromStationId: string; // the neighbor station sending the train
    trainNumber: string;
};

export default class ApprovalToast {
    private app: Application;
    private container: HTMLDivElement;

    constructor(app: Application) {
        this.app = app;
        this.container = this.ensureToastContainer();
    }

    // Remove all approval toasts from the UI (e.g., when simulation stops)
    public static clearAll(): void {
        const container = document.getElementById('approvalToastContainer') as HTMLDivElement | null;
        if (!container) return;

        // Hide any active Bootstrap toast instances first
        const toasts = Array.from(container.querySelectorAll('.toast')) as HTMLDivElement[];
        for (const toast of toasts) {
            (window as any).bootstrap.Toast.getInstance(toast)?.hide();
            toast.remove();
        }
    }

    public showApproval(request: ApprovalRequest): void {
        const toast = this.createToastElement(request);
        this.container.appendChild(toast);

        // Initialize Bootstrap toast with autohide disabled
        const bsToast = new (window as any).bootstrap.Toast(toast, { autohide: false });
        bsToast.show();
    }

    private ensureToastContainer(): HTMLDivElement {
        let container = document.getElementById('approvalToastContainer') as HTMLDivElement | null;
        if (!container) {
            container = document.createElement('div');
            container.id = 'approvalToastContainer';
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(container);
        }
        return container;
    }

    private createToastElement(request: ApprovalRequest): HTMLDivElement {
        const toast = document.createElement('div');
        toast.className = 'toast align-items-center text-bg-dark border-0';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        toast.setAttribute('data-bs-autohide', 'false');

        const header = document.createElement('div');
        header.className = 'toast-header';
        const strong = document.createElement('strong');
        strong.className = 'me-auto';
        strong.textContent = 'Fahranfrage';
        const small = document.createElement('small');
        small.textContent = request.stationId;
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'toast');
        closeBtn.setAttribute('aria-label', 'Close');
        header.appendChild(strong);
        header.appendChild(small);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'toast-body';
        const text = document.createElement('div');
        text.textContent = `Zug ${request.trainNumber} von ${request.fromStationId} annehmen?`;
        body.appendChild(text);

        const btnRow = document.createElement('div');
        btnRow.className = 'mt-2 pt-2 border-top d-flex gap-2';

        const acceptBtn = document.createElement('button');
        acceptBtn.className = 'btn btn-success btn-sm';
        acceptBtn.textContent = 'Annehmen';
        acceptBtn.onclick = async () => {
            await this.respond(request, true);
            (window as any).bootstrap.Toast.getInstance(toast)?.hide();
            toast.remove();
        };

        const denyBtn = document.createElement('button');
        denyBtn.className = 'btn btn-outline-light btn-sm';
        denyBtn.textContent = 'Ablehnen';
        denyBtn.onclick = async () => {
            await this.respond(request, false);
            (window as any).bootstrap.Toast.getInstance(toast)?.hide();
            toast.remove();
        };

        btnRow.appendChild(acceptBtn);
        btnRow.appendChild(denyBtn);
        body.appendChild(btnRow);

        toast.appendChild(header);
        toast.appendChild(body);
        return toast as HTMLDivElement;
    }

    private async respond(request: ApprovalRequest, approved: boolean): Promise<void> {
        const playerId = this.app.currentPlayerId;
        if (!playerId) {
            console.error('No playerId set; cannot respond to approval');
            return;
        }
        try {
            await this.app.signalRManager.respondApproval(playerId, request.trainNumber, request.stationId, approved);
        } catch (e) {
            console.error('Failed to respond approval', e);
        }
    }
}


