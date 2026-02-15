import { Application } from "../core/application";

export abstract class BasePanel {
  private static readonly NON_DRAGGABLE_SELECTOR = "button, input, select, textarea, a, .no-drag";
  private static readonly POSITION_STORAGE_PREFIX = "panel-position:";

  protected container: HTMLDivElement;
  protected isVisible = false;
  protected updateIntervalMs: number | null = null;
  protected updateTimerId: number | null = null;
  protected application: Application;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }

    if (this.isInteractiveTarget(event.target)) {
      return;
    }

    const rect = this.container.getBoundingClientRect();
    this.isDragging = true;
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    event.preventDefault();
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.isDragging) {
      return;
    }

    const newLeft = event.clientX - this.dragOffsetX;
    const newTop = event.clientY - this.dragOffsetY;

    this.container.style.transform = "none";
    this.container.style.right = "unset";
    this.container.style.bottom = "unset";
    this.container.style.left = `${newLeft}px`;
    this.container.style.top = `${newTop}px`;
  };

  private readonly onMouseUp = (): void => {
    const wasDragging = this.isDragging;
    this.isDragging = false;
    if (wasDragging) {
      this.savePosition();
    }
  };

  constructor(application: Application, updateIntervalMs: number | null = null) {
    this.application = application;
    this.updateIntervalMs = updateIntervalMs;
    this.container = this.createContainer();
    this.initialize();
    document.body.appendChild(this.container);
  }

  protected abstract createContent(): HTMLDivElement;

  private initialize(): void {
    this.container.appendChild(this.createContent());
    this.restorePosition();
    this.setupDragging();
  }

  protected createContainer(): HTMLDivElement {
    const container = document.createElement("div");
    const id = this.getContainerId();
    if (id) {
      container.id = id;
    }
    container.className = this.getContainerClasses();
    const styles = this.getContainerStyles();
    Object.assign(container.style, styles);
    return container;
  }

  private setupDragging(): void {
    this.container.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
  }

  private removeDragging(): void {
    this.container.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest(BasePanel.NON_DRAGGABLE_SELECTOR) !== null;
  }

  protected getContainerStyles(): Partial<CSSStyleDeclaration> {
    return {
      zIndex: "1000",
      minWidth: "300px",
      maxWidth: "400px",
      display: "none"
    };
  }

  protected getContainerClasses(): string {
    return "position-absolute m-3 p-1 bg-dark text-light rounded shadow-lg";
  }

  protected getContainerId(): string {
    return "";
  }

  private getStorageKey(): string {
    const id = this.getContainerId();
    if (id.length > 0) {
      return `${BasePanel.POSITION_STORAGE_PREFIX}${id}`;
    }

    const fallback = this.constructor.name || "BasePanel";
    return `${BasePanel.POSITION_STORAGE_PREFIX}${fallback}`;
  }

  private parsePx(value: string): number | null {
    const match = value.match(/^(-?\d+(?:\.\d+)?)px$/);
    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private clampToViewport(left: number, top: number): { left: number; top: number } {
    const minVisibleMargin = 40;
    const maxLeft = Math.max(0, window.innerWidth - minVisibleMargin);
    const maxTop = Math.max(0, window.innerHeight - minVisibleMargin);

    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: Math.min(Math.max(0, top), maxTop)
    };
  }

  private savePosition(): void {
    const left = this.parsePx(this.container.style.left);
    const top = this.parsePx(this.container.style.top);
    if (left === null || top === null) {
      return;
    }

    try {
      const payload = JSON.stringify({ left, top });
      localStorage.setItem(this.getStorageKey(), payload);
    } catch {
      // Ignore storage failures and keep panel draggable.
    }
  }

  private restorePosition(): void {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown };
      if (typeof parsed.left !== "number" || typeof parsed.top !== "number") {
        return;
      }

      if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) {
        return;
      }

      const safePosition = this.clampToViewport(parsed.left, parsed.top);

      this.container.style.transform = "none";
      this.container.style.right = "unset";
      this.container.style.bottom = "unset";
      this.container.style.left = `${safePosition.left}px`;
      this.container.style.top = `${safePosition.top}px`;
    } catch {
      // Ignore malformed payloads and continue with defaults.
    }
  }

  public show(): void {
    if (this.isVisible) {
      return;
    }

    this.container.style.display = "block";
    this.isVisible = true;
    this.startUpdates();
  }

  public hide(): void {
    if (!this.isVisible) {
      return;
    }

    this.container.style.display = "none";
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

  private startUpdates(): void {
    void this.Updates();
    if (this.updateIntervalMs !== null && this.updateIntervalMs > 0) {
      this.updateTimerId = window.setInterval(() => {
        void this.Updates();
      }, this.updateIntervalMs);
    }
  }

  protected async Updates(): Promise<void> {
    // Override in subclasses if needed
  }

  protected stopUpdates(): void {
    if (this.updateTimerId !== null) {
      clearInterval(this.updateTimerId);
      this.updateTimerId = null;
    }
  }

  public destroy(): void {
    this.stopUpdates();
    this.removeDragging();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  public getElement(): HTMLDivElement {
    return this.container;
  }
}
