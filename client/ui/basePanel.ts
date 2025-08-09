import { Application } from "../core/application";

export abstract class BasePanel {
  protected container: HTMLDivElement;
  protected isVisible: boolean = false;
  protected updateIntervalMs: number | null = null;
  protected updateTimerId: number | null = null;
  protected application: Application;

  constructor(application: Application, updateIntervalMs: number | null = null) {
    this.application = application;
    this.updateIntervalMs = updateIntervalMs;
    this.container = this.createContainer();
    this.setupContainer();
    document.body.appendChild(this.container);
  }

  protected abstract createContent(): HTMLDivElement;

  protected createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    const id = this.getContainerId();
    if (id) {
      container.id = id;
    }
    container.className = this.getContainerClasses();
    const styles = this.getContainerStyles();
    Object.assign(container.style, styles);
    return container;
  }

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

  protected getContainerId(): string {
    return '';
  }

  public show(): void {
    this.container.style.display = 'block';
    this.isVisible = true;
    this.Updates();
    if (this.updateIntervalMs !== null && this.updateIntervalMs > 0) {
      this.updateTimerId = window.setInterval(() => {
        this.Updates();
      }, this.updateIntervalMs);
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
    if (this.updateTimerId) {
      clearInterval(this.updateTimerId);
      this.updateTimerId = null;
    }
  }

  public destroy(): void {
    this.stopUpdates();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  
}
