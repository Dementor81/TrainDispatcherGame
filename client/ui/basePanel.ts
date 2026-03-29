import { Application } from "../core/application";

export interface BasePanelOptions {
  updateIntervalMs?: number | null;
  title?: string;
  width?: number;
  height?: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  resizable?: boolean;
}

export abstract class BasePanel {
  private static readonly NON_DRAGGABLE_SELECTOR = "button, input, select, textarea, a, .no-drag";
  private static readonly POSITION_STORAGE_PREFIX = "panel-position:";
  private static readonly MIN_PANEL_WIDTH = 180;
  private static readonly MIN_PANEL_HEIGHT = 100;

  protected container: HTMLDivElement;
  protected isVisible = false;
  protected updateIntervalMs: number | null = null;
  protected updateTimerId: number | null = null;
  protected application: Application;
  private readonly isResizable: boolean;
  private readonly panelTitle: string | null;
  private resizeHandle: HTMLDivElement | null = null;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private isResizing = false;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) {
      return;
    }

    if (this.isResizing) {
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
    if (this.isResizing) {
      this.resizeToPointer(event.clientX, event.clientY);
      event.preventDefault();
      return;
    }

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
    const wasResizing = this.isResizing;
    this.isDragging = false;
    this.isResizing = false;
    if (wasDragging || wasResizing) {
      this.savePanelState();
    }
  };

  private readonly onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length !== 1) return;
    if (this.isResizing) return;
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
    if (this.isResizing && event.touches.length === 1) {
      const touch = event.touches[0];
      this.resizeToPointer(touch.clientX, touch.clientY);
      event.preventDefault();
      return;
    }

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
    const wasResizing = this.isResizing;
    this.isDragging = false;
    this.isResizing = false;
    if (wasDragging || wasResizing) {
      this.savePanelState();
    }
  };

  private readonly onResizeMouseDown = (event: MouseEvent): void => {
    if (!this.isResizable || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.beginResize(event.clientX, event.clientY);
  };

  private readonly onResizeTouchStart = (event: TouchEvent): void => {
    if (!this.isResizable || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    event.preventDefault();
    event.stopPropagation();
    this.beginResize(touch.clientX, touch.clientY);
  };

  constructor(application: Application, options: BasePanelOptions = {}) {
    this.application = application;
    this.updateIntervalMs = options.updateIntervalMs ?? null;
    this.isResizable = options.resizable === true;
    this.panelTitle = options.title?.trim() || null;
    this.container = this.createContainer(options);
    this.initialize();
    document.body.appendChild(this.container);
  }

  protected abstract createContent(): HTMLDivElement;

  private initialize(): void {
    if (this.panelTitle) {
      const titleNotch = this.createTitleNotch();
      this.container.appendChild(titleNotch);
    }

    const content = this.createContent();
    const scrollContent = document.createElement("div");
    scrollContent.className = "base-panel-content";
    scrollContent.appendChild(content);
    this.container.appendChild(scrollContent);

    if (this.isResizable) {
      this.container.style.overflow = "hidden";
      this.container.classList.add("base-panel-resizable");
      this.createResizeHandle();
    }
    this.restorePanelState();
    if (this.panelTitle) {
      this.setupDragging();
    }
  }

  private createTitleNotch(): HTMLDivElement {
    const titleNotch = document.createElement("div");
    titleNotch.className = "base-panel-title-notch";
    titleNotch.textContent = this.panelTitle ?? "";
    titleNotch.title = this.panelTitle ?? "";
    return titleNotch;
  }

  protected createContainer(options: BasePanelOptions): HTMLDivElement {
    const container = document.createElement("div");
    container.id = this.constructor.name;
    container.className = "position-absolute p-1 base-panel text-light rounded shadow-lg";
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

  private createResizeHandle(): void {
    const handle = document.createElement("div");
    handle.className = "base-panel-resize-handle no-drag";
    handle.addEventListener("mousedown", this.onResizeMouseDown);
    handle.addEventListener("touchstart", this.onResizeTouchStart, { passive: false });
    this.container.appendChild(handle);
    this.resizeHandle = handle;
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
    if (this.resizeHandle) {
      this.resizeHandle.removeEventListener("mousedown", this.onResizeMouseDown);
      this.resizeHandle.removeEventListener("touchstart", this.onResizeTouchStart);
      this.resizeHandle = null;
    }
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

  private beginResize(pointerX: number, pointerY: number): void {
    const rect = this.container.getBoundingClientRect();
    this.anchorToTopLeft(rect);
    this.isDragging = false;
    this.isResizing = true;
    this.resizeStartX = pointerX;
    this.resizeStartY = pointerY;
    this.resizeStartWidth = rect.width;
    this.resizeStartHeight = rect.height;
  }

  private clampPanelSize(width: number, height: number): { width: number; height: number } {
    const rect = this.container.getBoundingClientRect();
    const maxWidth = Math.max(BasePanel.MIN_PANEL_WIDTH, window.innerWidth - rect.left);
    const maxHeight = Math.max(BasePanel.MIN_PANEL_HEIGHT, window.innerHeight - rect.top);

    return {
      width: Math.min(Math.max(BasePanel.MIN_PANEL_WIDTH, width), maxWidth),
      height: Math.min(Math.max(BasePanel.MIN_PANEL_HEIGHT, height), maxHeight)
    };
  }

  private resizeToPointer(pointerX: number, pointerY: number): void {
    if (!this.isResizable) {
      return;
    }

    const deltaX = pointerX - this.resizeStartX;
    const deltaY = pointerY - this.resizeStartY;
    const nextWidth = this.resizeStartWidth + deltaX;
    const nextHeight = this.resizeStartHeight + deltaY;
    const clamped = this.clampPanelSize(nextWidth, nextHeight);
    this.container.style.width = `${clamped.width}px`;
    this.container.style.height = `${clamped.height}px`;
  }

  private savePanelState(): void {
    const left = this.parsePx(this.container.style.left);
    const top = this.parsePx(this.container.style.top);
    const payload: { left?: number; top?: number; width?: number; height?: number } = {};

    if (left !== null && top !== null) {
      payload.left = left;
      payload.top = top;
    }

    if (this.isResizable) {
      const rect = this.container.getBoundingClientRect();
      const clamped = this.clampPanelSize(rect.width, rect.height);
      payload.width = Math.round(clamped.width);
      payload.height = Math.round(clamped.height);
    }

    if (Object.keys(payload).length === 0) {
      return;
    }

    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(payload));
    } catch {
      // Ignore storage failures and keep panel draggable.
    }
  }

  private restorePanelState(): boolean {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (!raw) {
        return false;
      }

      const parsed = JSON.parse(raw) as { left?: unknown; top?: unknown; width?: unknown; height?: unknown };
      let restored = false;

      if (
        this.isResizable &&
        typeof parsed.width === "number" &&
        typeof parsed.height === "number" &&
        Number.isFinite(parsed.width) &&
        Number.isFinite(parsed.height)
      ) {
        const clamped = this.clampPanelSize(parsed.width, parsed.height);
        this.container.style.width = `${clamped.width}px`;
        this.container.style.height = `${clamped.height}px`;
        restored = true;
      }

      if (
        typeof parsed.left === "number" &&
        typeof parsed.top === "number" &&
        Number.isFinite(parsed.left) &&
        Number.isFinite(parsed.top)
      ) {
        const safePosition = this.clampToViewport(parsed.left, parsed.top);
        this.container.style.transform = "none";
        this.container.style.right = "unset";
        this.container.style.bottom = "unset";
        this.container.style.left = `${safePosition.left}px`;
        this.container.style.top = `${safePosition.top}px`;
        restored = true;
      }

      return restored;
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
