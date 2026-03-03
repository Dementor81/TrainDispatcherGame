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
        toast.className = 'toast align-items-center border-0';
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        toast.setAttribute('data-bs-autohide', 'false');

        const header = document.createElement('div');
        header.className = 'toast-header';
        const strong = document.createElement('strong');
        strong.className = 'me-auto';
        strong.textContent = 'Fahranfrage';
        const small = document.createElement('div');
        small.className = 'text-secondary';
        small.textContent = request.fromStationId;
        header.appendChild(strong);
        header.appendChild(small);

        const body = document.createElement('div');
        body.className = 'toast-body text-bg-dark';
        const text = document.createElement('div');
        text.textContent = `Wird Zug ${request.trainNumber} angenommen?`;
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
        try {
            await this.app.signalRManager.respondApproval(request.trainNumber, request.stationId, approved);
        } catch (e) {
            console.error('Failed to respond approval', e);
        }
    }
}


