import { Application } from "../core/application";

export abstract class BasePanel {
  protected container: HTMLDivElement;
  protected isVisible: boolean = false;
  protected updateInterval: number | null = null;
  protected application: Application;

  constructor(application: Application, updateInterval: number | null = null) {
    this.application = application;
    this.container = this.createContainer();
    this.setupContainer();
    document.body.appendChild(this.container);
    this.updateInterval = updateInterval;
  }

  protected abstract createContainer(): HTMLDivElement;
  protected abstract createContent(): HTMLDivElement;

  private setupContainer(): void {
    const content = this.createContent();
    this.container.appendChild(content);
  }

  protected getContainerStyles(): Partial<CSSStyleDeclaration> {
    return {
      zIndex: '1000',
      minWidth: '300px',
      maxWidth: '400px',
      display: 'none'
    };
  }

  protected getContainerClasses(): string {
    return 'position-absolute m-3 p-3 bg-dark text-light rounded shadow-lg';
  }

  public show(): void {
    this.container.style.display = 'block';
    this.isVisible = true;
    this.Updates();
    if (this.updateInterval) {      
      this.updateInterval = window.setInterval(() => {
        this.Updates();
      }, this.updateInterval);
    }
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
    this.stopUpdates();
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  protected async Updates(): Promise<void> {
    // Override in subclasses if needed
  }

  protected stopUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  public destroy(): void {
    this.stopUpdates();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  
}
