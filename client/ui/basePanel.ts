import { Application } from "../core/application";

export interface BasePanelOptions {
  updateIntervalMs?: number | null;
  width?: number;
  height?: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

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
    this.anchorToTopLeft(rect);
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

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 1) return;
    if (this.isInteractiveTarget(event.target)) return;

    const touch = event.touches[0];
    const rect = this.container.getBoundingClientRect();
    this.anchorToTopLeft(rect);
    this.isDragging = true;
    this.dragOffsetX = touch.clientX - rect.left;
    this.dragOffsetY = touch.clientY - rect.top;
    event.preventDefault();
  };

  private readonly onTouchMove = (event: TouchEvent): void => {
    if (!this.isDragging || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const newLeft = touch.clientX - this.dragOffsetX;
    const newTop = touch.clientY - this.dragOffsetY;

    this.container.style.transform = "none";
    this.container.style.right = "unset";
    this.container.style.bottom = "unset";
    this.container.style.left = `${newLeft}px`;
    this.container.style.top = `${newTop}px`;
  };

  private readonly onTouchEnd = (): void => {
    const wasDragging = this.isDragging;
    this.isDragging = false;
    if (wasDragging) {
      this.savePosition();
    }
  };

  constructor(application: Application, options: BasePanelOptions = {}) {
    this.application = application;
    this.updateIntervalMs = options.updateIntervalMs ?? null;
    this.container = this.createContainer(options);
    this.initialize();
    document.body.appendChild(this.container);
  }

  protected abstract createContent(): HTMLDivElement;

  private initialize(): void {
    this.container.appendChild(this.createContent());
    this.restorePosition();
    this.setupDragging();
  }

  protected createContainer(options: BasePanelOptions): HTMLDivElement {
    const container = document.createElement("div");
    container.id = this.constructor.name;
    container.className = "position-absolute m-3 p-1 base-panel text-light rounded shadow-lg";
    const containerStyles: Partial<CSSStyleDeclaration> = {
      zIndex: "1000",
      display: "none",
      width: this.toPx(options.width),
      height: this.toPx(options.height) ?? "auto",
      top: this.toPx(options.top),
      bottom: this.toPx(options.bottom),
      left: this.toPx(options.left),
      right: this.toPx(options.right)
    };
    Object.assign(container.style, containerStyles);
    return container;
  }

  private toPx(value: number | undefined): string | undefined {
    return value === undefined ? undefined : `${value}px`;
  }

  private anchorToTopLeft(rect: DOMRect): void {
    const hasRightAnchor = this.container.style.right !== "" && this.container.style.right !== "unset";
    const hasBottomAnchor = this.container.style.bottom !== "" && this.container.style.bottom !== "unset";

    this.container.style.transform = "none";
    if (hasRightAnchor || hasBottomAnchor) {
      this.container.style.width = `${rect.width}px`;
      this.container.style.height = `${rect.height}px`;
    }
    if (hasRightAnchor) {
      this.container.style.right = "unset";
      this.container.style.left = `${rect.left}px`;
    }
    if (hasBottomAnchor) {
      this.container.style.bottom = "unset";
      this.container.style.top = `${rect.top}px`;
    }
  }

  private setupDragging(): void {
    this.container.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
    this.container.addEventListener("touchstart", this.onTouchStart, { passive: false });
    document.addEventListener("touchmove", this.onTouchMove, { passive: false });
    document.addEventListener("touchend", this.onTouchEnd);
  }

  private removeDragging(): void {
    this.container.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    this.container.removeEventListener("touchstart", this.onTouchStart);
    document.removeEventListener("touchmove", this.onTouchMove);
    document.removeEventListener("touchend", this.onTouchEnd);
  }

  private isInteractiveTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && target.closest(BasePanel.NON_DRAGGABLE_SELECTOR) !== null;
  }

  private getStorageKey(): string {
    return `${BasePanel.POSITION_STORAGE_PREFIX}${this.constructor.name || "BasePanel"}`;
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

  private restorePosition(): boolean {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (!raw) {
        return false;
      }

      const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown };
      if (typeof parsed.left !== "number" || typeof parsed.top !== "number") {
        return false;
      }

      if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) {
        return false;
      }

      const safePosition = this.clampToViewport(parsed.left, parsed.top);

      this.container.style.transform = "none";
      this.container.style.right = "unset";
      this.container.style.bottom = "unset";
      this.container.style.left = `${safePosition.left}px`;
      this.container.style.top = `${safePosition.top}px`;
      return true;
    } catch {
      // Ignore malformed payloads and continue with defaults.
      return false;
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
