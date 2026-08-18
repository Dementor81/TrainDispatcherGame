import { GameMasterApplication } from "./gameMasterApplication";
import { BlockedExitsChangedNotificationDto } from "../network/dto";
import { BasePanel } from "../ui/basePanel";

export class BlockedExitsPanel extends BasePanel {
  private readonly onChanged = (data: BlockedExitsChangedNotificationDto) => this.renderStations(data);

  constructor(app: GameMasterApplication) {
    super(app as any, { width: 320, height: 400, top: 410, left: 630, title: 'Blockierte Ausfahrten', resizable: true });
    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "rounded p-2 small";
    section.style.height = "100%";
    section.style.overflow = "auto";

    const body = document.createElement("div");
    body.id = "blockedExitsListBody";
    body.className = "pt-1";

    const empty = document.createElement("div");
    empty.className = "text-muted";
    empty.textContent = "Keine blockierten Ausfahrten";
    body.appendChild(empty);

    section.appendChild(body);
    return section;
  }

  public override show(): void {
    const wasVisible = this.isVisible;
    super.show();
    if (!wasVisible) {
      this.application.eventManager.on("blockedExitsChanged", this.onChanged);
    }
  }

  public override hide(): void {
    if (this.isVisible) {
      this.application.eventManager.off("blockedExitsChanged", this.onChanged);
    }
    super.hide();
  }

  private renderStations(data: BlockedExitsChangedNotificationDto): void {
    if (!this.isVisible) return;

    const listEl = this.container.querySelector("#blockedExitsListBody") as HTMLElement | null;
    if (!listEl) return;

    listEl.innerHTML = "";

    const stations = data?.stations ?? {};
    const stationIds = Object.keys(stations).sort();

    if (stationIds.length === 0) {
      const empty = document.createElement("div");
      empty.className = "text-muted";
      empty.textContent = "Keine blockierten Ausfahrten";
      listEl.appendChild(empty);
      return;
    }

    for (const stationId of stationIds) {
      const group = document.createElement("div");
      group.className = "pb-2 mb-1 border-bottom border-secondary";

      const header = document.createElement("div");
      header.className = "text-secondary";
      header.textContent = stationId;

      const exits = document.createElement("div");
      exits.className = "text-light";
      exits.textContent = (stations[stationId] ?? []).join(", ");

      group.appendChild(header);
      group.appendChild(exits);
      listEl.appendChild(group);
    }
  }
}

export default BlockedExitsPanel;
