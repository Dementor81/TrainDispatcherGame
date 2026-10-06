import { BasePanel } from "../ui/basePanel";
import { HudMenu, HudMenuItem } from "../ui/hudMenu";

export class AdminMenuPanel extends BasePanel {
  private readonly menu: HudMenu;

  constructor(items: HudMenuItem[]) {
    super(null, { width: 120, top: 8, left: 8, title: "Admin", resizable: false, closeable: false });
    this.menu = new HudMenu(this.menuButton);
    this.menu.setItems(items);
    this.show();
  }

  private menuButton!: HTMLButtonElement;

  protected createContent(): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "d-flex align-items-center";

    this.menuButton = document.createElement("button");
    this.menuButton.type = "button";
    this.menuButton.className = "btn btn-link text-light p-0 no-drag hud-menu-button";
    this.menuButton.title = "Menü";
    this.menuButton.setAttribute("aria-label", "Menü");
    this.menuButton.innerHTML = '<i class="bi bi-list"></i>';
    row.appendChild(this.menuButton);
    return row;
  }

  public override destroy(): void {
    this.menu.destroy();
    super.destroy();
  }
}
