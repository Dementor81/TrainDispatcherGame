export class HUD {
    private container: HTMLDivElement;
    private connectionStatusElement: HTMLDivElement;
    private isVisible: boolean = false;

    constructor() {
        this.container = this.createContainer();
        this.connectionStatusElement = this.createConnectionStatusElement();
        this.container.appendChild(this.connectionStatusElement);
        document.body.appendChild(this.container);
    }

    private createContainer(): HTMLDivElement {
        const container = document.createElement('div');
        container.id = 'hud';
        container.className = 'position-fixed bottom-0 end-0 m-3 p-2 bg-dark text-light rounded shadow-lg';
        container.style.zIndex = '1000';
        container.style.minWidth = '200px';
        container.style.display = 'none';
        return container;
    }

    private createConnectionStatusElement(): HTMLDivElement {
        const statusDiv = document.createElement('div');
        statusDiv.className = 'd-flex align-items-center gap-2';
        
        const icon = document.createElement('i');
        icon.id = 'connectionIcon';
        icon.className = 'bi bi-wifi-off text-danger';
        
        const text = document.createElement('span');
        text.id = 'connectionText';
        text.textContent = 'Disconnected';
        text.className = 'small';
        
        statusDiv.appendChild(icon);
        statusDiv.appendChild(text);
        
        return statusDiv;
    }

    public show(): void {
        this.container.style.display = 'block';
        this.isVisible = true;
    }

    public hide(): void {
        this.container.style.display = 'none';
        this.isVisible = false;
    }

    public updateConnectionStatus(isConnected: boolean, isReconnecting: boolean = false): void {
        const icon = document.getElementById('connectionIcon') as HTMLElement;
        const text = document.getElementById('connectionText') as HTMLElement;
        
        if (!icon || !text) return;
        
        if (isConnected) {
            icon.className = 'bi bi-wifi text-success';
            text.textContent = 'Connected';
        } else if (isReconnecting) {
            icon.className = 'bi bi-wifi-1 text-warning';
            text.textContent = 'Reconnecting...';
        } else {
            icon.className = 'bi bi-wifi-off text-danger';
            text.textContent = 'Disconnected';
        }
    }

    public destroy(): void {
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
