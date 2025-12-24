/**
 * Simple utility for showing Bootstrap toast notifications
 */
export class Toast {
    private static ensureToastContainer(): HTMLDivElement {
        let container = document.getElementById('toastContainer') as HTMLDivElement | null;
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Show a simple toast message
     * @param message - The message to display
     * @param type - The toast type: 'success', 'error', 'warning', 'info' (default: 'info')
     * @param duration - Auto-hide duration in milliseconds (default: 5000, set to 0 to disable auto-hide)
     */
    public static show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', duration: number = 5000): void {
        const container = this.ensureToastContainer();
        const toast = this.createToastElement(message, type, duration);
        container.appendChild(toast);

        // Initialize Bootstrap toast
        const bsToast = new (window as any).bootstrap.Toast(toast, { 
            autohide: duration > 0,
            delay: duration 
        });
        bsToast.show();

        // Remove toast element after it's hidden
        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    private static createToastElement(message: string, type: string, duration: number): HTMLDivElement {
        // Map type to Bootstrap color class
        const colorClass = type === 'error' ? 'danger' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'info';
        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-bg-${colorClass} border-0`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');
        if (duration > 0) {
            toast.setAttribute('data-bs-autohide', 'true');
            toast.setAttribute('data-bs-delay', duration.toString());
        } else {
            toast.setAttribute('data-bs-autohide', 'false');
        }

        const body = document.createElement('div');
        body.className = 'toast-body d-flex align-items-center';
        
        const messageText = document.createElement('div');
        messageText.className = 'me-auto';
        messageText.textContent = message;
        body.appendChild(messageText);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn-close btn-close-white ms-2';
        closeBtn.setAttribute('data-bs-dismiss', 'toast');
        closeBtn.setAttribute('aria-label', 'Close');
        body.appendChild(closeBtn);

        toast.appendChild(body);
        return toast as HTMLDivElement;
    }
}

export default Toast;

