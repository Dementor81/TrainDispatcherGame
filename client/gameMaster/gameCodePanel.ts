import { BasePanel } from "../ui/basePanel";
import { UI } from "../utils/ui";

export class GameCodePanel extends BasePanel {
  private static readonly QR_POPUP_NAME = "game-code-qr";

  constructor() {
    super(null as any, { width: 280, height: 88, top: 600, right: 850, title: 'Game-Code' });
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

    const copyButton = UI.createButton("btn-sm btn-outline-light no-drag", "Kopieren", () => {
      void this.copyToClipboard(code.textContent ?? "");
    });
    copyButton.innerHTML = '<i class="bi bi-clipboard"></i>';

    const qrButton = UI.createButton("btn-sm btn-outline-light no-drag", '', () => {
      this.openQrCodePopup(code.textContent ?? "");
    });
    qrButton.innerHTML = '<i class="bi bi-qr-code"></i>';

    row.appendChild(code);
    row.appendChild(copyButton);
    row.appendChild(qrButton);
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

  private openQrCodePopup(gameCode: string): void {
    if (!gameCode || gameCode === "-") {
      return;
    }

    const landingUrl = new URL("../index.html", window.location.href);
    landingUrl.searchParams.set("gamecode", gameCode);
    const targetUrl = landingUrl.toString();
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(targetUrl)}`;
    const features = "popup=yes,width=420,height=520,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no";
    const popup = window.open("", GameCodePanel.QR_POPUP_NAME, features);
    if (!popup) {
      return;
    }

    popup.document.title = `Game-Code ${gameCode}`;
    popup.document.body.style.backgroundColor = '#000';
    popup.document.body.innerHTML = `
      <main style="margin:0;height:100%;display:flex;align-items:center;justify-content:center;background:#111;color:#eee;font-family:Arial,sans-serif;">
        <div style="display:flex;flex-direction:column;gap:10px;align-items:center;padding:18px;">
          <img src="${qrUrl}" alt="QR code for game code ${this.escapeHtml(gameCode)}" width="320" height="320" style="background:#fff;border-radius:6px;padding:6px;" />
        </div>
      </main>
    `;
    popup.focus();
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

export default GameCodePanel;
