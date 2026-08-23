import "../styles/hudMenu.css";
import { getSimulationStatus } from "../network/api";
import Toast from "./toast";

export interface HudMenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  children?: HudMenuItem[];
  onSelect?: () => void;
}

export type HudMenuItemsProvider = () => HudMenuItem[];

export async function openTimeDistanceDiagram(): Promise<void> {
  try {
    const status = await getSimulationStatus();
    const scenarioId = status.scenarioId as string | undefined;
    if (!scenarioId) {
      Toast.show("Kein Szenario geladen.", "warning");
      return;
    }
    window.open(`timeDistance.html?scenario=${encodeURIComponent(scenarioId)}`, "_blank");
  } catch {
    Toast.show("Zeit-Weg-Diagramm konnte nicht geöffnet werden.", "error");
  }
}

export const TIME_DISTANCE_MENU_ITEM: HudMenuItem = {
  id: "time-distance",
  label: "Zeit-Weg-Diagramm",
  icon: "bi-graph-up",
  onSelect: () => { void openTimeDistanceDiagram(); },
};

export class HudMenu {
  private items: HudMenuItem[] | HudMenuItemsProvider = [];
  private menuEl: HTMLDivElement | null = null;
  private readonly expandedIds = new Set<string>();

  constructor(private readonly button: HTMLButtonElement) {
    this.button.setAttribute("aria-haspopup", "true");
    this.button.setAttribute("aria-expanded", "false");
    this.button.addEventListener("click", this.onButtonClick);
  }

  public setItems(items: HudMenuItem[] | HudMenuItemsProvider): void {
    this.items = items;
  }

  public destroy(): void {
    this.close();
    this.button.removeEventListener("click", this.onButtonClick);
  }

  private readonly onButtonClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (this.menuEl) {
      this.close();
    } else {
      this.open();
    }
  };

  private resolveItems(): HudMenuItem[] {
    return typeof this.items === "function" ? this.items() : this.items;
  }

  private open(): void {
    const menu = document.createElement("div");
    menu.className = "hud-menu";
    menu.setAttribute("role", "menu");
    this.menuEl = menu;
    this.render();
    document.body.appendChild(menu);
    this.positionMenu();
    this.button.setAttribute("aria-expanded", "true");
    window.addEventListener("resize", this.onViewportChange);
    document.addEventListener("mousedown", this.onDocumentMouseDown);
    document.addEventListener("keydown", this.onDocumentKeyDown);
  }

  private render(): void {
    if (!this.menuEl) {
      return;
    }

    this.menuEl.replaceChildren();
    this.appendItems(this.menuEl, this.resolveItems(), 0);
  }

  private appendItems(menu: HTMLDivElement, items: HudMenuItem[], depth: number): void {
    for (const item of items) {
      menu.appendChild(this.createRow(item, depth));
      if (item.children && item.children.length > 0 && this.expandedIds.has(item.id)) {
        this.appendItems(menu, item.children, depth + 1);
      }
    }
  }

  private createRow(item: HudMenuItem, depth: number): HTMLButtonElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "hud-menu-item no-drag";
    if (depth > 0) {
      row.classList.add("hud-menu-item-nested");
    }
    row.setAttribute("role", "menuitem");
    row.disabled = item.disabled === true;

    if (item.icon) {
      const icon = document.createElement("i");
      icon.className = `bi ${item.icon}`;
      row.appendChild(icon);
    }

    const label = document.createElement("span");
    label.className = "hud-menu-item-label";
    label.textContent = item.label;
    row.appendChild(label);

    const hasChildren = item.children != null && item.children.length > 0;
    if (hasChildren) {
      const expanded = this.expandedIds.has(item.id);
      const chevron = document.createElement("i");
      chevron.className = `bi ${expanded ? "bi-chevron-down" : "bi-chevron-right"} hud-menu-chevron`;
      row.appendChild(chevron);
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        if (this.expandedIds.has(item.id)) {
          this.expandedIds.delete(item.id);
        } else {
          this.expandedIds.add(item.id);
        }
        this.render();
        this.positionMenu();
      });
    } else {
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        if (item.disabled) {
          return;
        }
        this.close();
        item.onSelect?.();
      });
    }

    return row;
  }

  private positionMenu(): void {
    if (!this.menuEl) {
      return;
    }

    const rect = this.button.getBoundingClientRect();
    const menuWidth = this.menuEl.offsetWidth;
    const left = Math.min(rect.left, Math.max(8, window.innerWidth - menuWidth - 8));
    this.menuEl.style.top = `${rect.bottom + 4}px`;
    this.menuEl.style.left = `${Math.max(8, left)}px`;
  }

  private close(): void {
    if (!this.menuEl) {
      return;
    }

    this.menuEl.remove();
    this.menuEl = null;
    this.expandedIds.clear();
    this.button.setAttribute("aria-expanded", "false");
    window.removeEventListener("resize", this.onViewportChange);
    document.removeEventListener("mousedown", this.onDocumentMouseDown);
    document.removeEventListener("keydown", this.onDocumentKeyDown);
  }

  private readonly onViewportChange = (): void => {
    this.positionMenu();
  };

  private readonly onDocumentMouseDown = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) {
      this.close();
      return;
    }
    if (this.button.contains(target) || this.menuEl?.contains(target)) {
      return;
    }
    this.close();
  };

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.close();
    }
  };
}
