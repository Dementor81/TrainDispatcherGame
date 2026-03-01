import { fetchOpenLineTracks } from "../network/api";
import { BasePanel } from "../ui/basePanel";

export class OpenLinePanel extends BasePanel {
  constructor() {
    super(null as any, { width: 620, height: 400, top: 0, left: 630, updateIntervalMs: 2000 });

    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "rounded p-2";
    section.style.height = "100%";
    section.style.overflow = "auto";

    const header = document.createElement("div");
    header.className = "d-flex flex-row gap-2 text-secondary small pb-1 border-bottom border-secondary";
    const h1 = document.createElement("div"); h1.style.width = "160px"; h1.textContent = "von";
    const h2 = document.createElement("div"); h2.style.width = "160px"; h2.textContent = "nach";
    const h3 = document.createElement("div"); h3.style.width = "120px"; h3.textContent = "ein/zweigleisig";
    const h4 = document.createElement("div"); h4.style.flex = "1 1 auto"; h4.textContent = "Zug";
    header.appendChild(h1); header.appendChild(h2); header.appendChild(h3); header.appendChild(h4);

    const body = document.createElement("div");
    body.id = "openLineListBody";
    body.className = "pt-1";

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  protected async Updates(): Promise<void> {
    try {
      const listEl = this.container.querySelector("#openLineListBody") as HTMLElement | null;
      if (!listEl) return;

      const tracks = await fetchOpenLineTracks();
      listEl.innerHTML = "";

      if (!tracks || tracks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "text-muted";
        empty.textContent = "No open line tracks available";
        listEl.appendChild(empty);
        return;
      }

      for (const t of tracks) {
        const row = document.createElement("div");
        row.className = "d-flex small flex-row gap-2 align-items-start py-1 border-bottom border-secondary";

        const from = document.createElement("div");
        from.className = "text-light";
        from.style.width = "160px";
        from.textContent = `${t.from} (${t.fromExitId})`;

        const to = document.createElement("div");
        to.className = "text-light";
        to.style.width = "160px";
        to.textContent = `${t.to} (${t.toExitId})`;

        const mode = document.createElement("div");
        mode.className = "text-light";
        mode.style.width = "120px";

        // Display mode as icons
        if (t.mode === "DualTrack") {
          mode.innerHTML = "<i class=\"bi bi-arrow-left-right\"></i>";
        } else if (t.mode === "SingleTrack") {
          mode.innerHTML = "<i class=\"bi bi-arrows\"></i>";
        } else {
          mode.textContent = "-";
        }

        const train = document.createElement("div");
        train.className = "text-light";
        train.style.flex = "1 1 auto";
        train.textContent = t.trainNumber ?? "-";

        row.appendChild(from);
        row.appendChild(to);
        row.appendChild(mode);
        row.appendChild(train);

        listEl.appendChild(row);
      }
    } catch (err) {
      console.error("OpenLinePanel: failed to update", err);
    }
  }
}

export default OpenLinePanel;
