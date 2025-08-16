export class NotificationModal {
    private modalElement: HTMLDivElement;
    private titleElement: HTMLHeadingElement | null = null;
    private bodyElement: HTMLDivElement | null = null;
    private bootstrapModal: any;

    constructor() {
        this.modalElement = this.createModalElement();
        document.body.appendChild(this.modalElement);

        // Initialize Bootstrap Modal instance
        this.bootstrapModal = new (window as any).bootstrap.Modal(this.modalElement);
    }

    private createModalElement(): HTMLDivElement {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'notificationModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-hidden', 'true');

        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog modal-dialog-centered';

        const content = document.createElement('div');
        content.className = 'modal-content';

        const header = document.createElement('div');
        header.className = 'modal-header';

        const title = document.createElement('h5');
        title.className = 'modal-title';
        title.id = 'notificationModalLabel';
        title.textContent = 'Hinweis';
        this.titleElement = title as HTMLHeadingElement;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close';
        closeBtn.setAttribute('data-bs-dismiss', 'modal');
        closeBtn.setAttribute('aria-label', 'Close');

        const body = document.createElement('div');
        body.className = 'modal-body';
        body.textContent = '';
        this.bodyElement = body as HTMLDivElement;

        const footer = document.createElement('div');
        footer.className = 'modal-footer';

        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = 'btn btn-primary';
        okBtn.setAttribute('data-bs-dismiss', 'modal');
        okBtn.textContent = 'OK';

        header.appendChild(title);
        header.appendChild(closeBtn);
        footer.appendChild(okBtn);
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        dialog.appendChild(content);
        modal.appendChild(dialog);

        return modal as HTMLDivElement;
    }

    public show(message: string, title?: string): void {
        if (title) {
            this.titleElement!.textContent = title;
        }
        this.bodyElement!.textContent = message;
        this.bootstrapModal.show();
    }

    public destroy(): void {
        if (this.modalElement.parentNode) {
            this.modalElement.parentNode.removeChild(this.modalElement);
        }
    }
}

export default NotificationModal;


