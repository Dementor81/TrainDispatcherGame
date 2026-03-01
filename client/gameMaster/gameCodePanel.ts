import { BasePanel } from "../ui/basePanel";

export class GameCodePanel extends BasePanel {
  constructor() {
    super(null as any, { width: 280, height: 88, top: 600, right: 850 });
    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "d-flex flex-column gap-2 rounded p-2";
    section.style.height = "100%";

    const title = document.createElement("div");
    title.className = "text-secondary small";
    title.textContent = "Game-Code";

    const row = document.createElement("div");
    row.className = "d-flex align-items-center gap-2";

    const code = document.createElement("code");
    code.className = "fs-5 text-light";
    code.id = "adminGameCodeValue";
    code.textContent = this.resolveGameCode();

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "btn btn-sm btn-outline-light no-drag";
    copyButton.textContent = "Kopieren";
    copyButton.addEventListener("click", () => {
      void this.copyToClipboard(code.textContent ?? "");
    });

    row.appendChild(code);
    row.appendChild(copyButton);
    section.appendChild(title);
    section.appendChild(row);
    return section;
  }

  private resolveGameCode(): string {
    const stored = sessionStorage.getItem("gameCode")?.trim();
    return stored && stored.length > 0 ? stored : "-";
  }

  private async copyToClipboard(value: string): Promise<void> {
    if (!value || value === "-") {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
    } catch (error) {
      console.error("Failed to copy game code", error);
    }
  }
}

export default GameCodePanel;
