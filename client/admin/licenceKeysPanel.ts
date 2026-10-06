import { addLicenceKey, AdminUnauthorizedError, deleteLicenceKey, fetchLicenceKeys, LicenceKeyEntry } from "./api";
import { BasePanel } from "../ui/basePanel";
import Toast from "../ui/toast";

export class LicenceKeysPanel extends BasePanel {
  private listEl!: HTMLDivElement;
  private labelInput!: HTMLInputElement;
  private keyInput!: HTMLInputElement;
  private addButton!: HTMLButtonElement;

  constructor() {
    super(null, {
      width: 560,
      height: 360,
      top: 72,
      right: 8,
      title: "Lizenzschlüssel",
      resizable: true,
      closeable: true,
    });
    this.show();
  }

  protected createContent(): HTMLDivElement {
    const section = document.createElement("div");
    section.className = "d-flex flex-column gap-2 p-2 small";
    section.style.height = "100%";

    const form = document.createElement("form");
    form.className = "d-flex gap-2 no-drag";
    form.setAttribute("data-bs-theme", "dark");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submitKey();
    });

    this.labelInput = document.createElement("input");
    this.labelInput.type = "text";
    this.labelInput.className = "form-control form-control-sm";
    this.labelInput.placeholder = "Bezeichnung";
    this.labelInput.autocomplete = "off";
    this.labelInput.style.width = "160px";
    this.labelInput.addEventListener("input", () => this.labelInput.classList.remove("is-invalid"));

    this.keyInput = document.createElement("input");
    this.keyInput.type = "text";
    this.keyInput.className = "form-control form-control-sm";
    this.keyInput.placeholder = "Lizenzschlüssel";
    this.keyInput.autocomplete = "off";
    this.keyInput.style.flex = "1 1 auto";
    this.keyInput.addEventListener("input", () => this.keyInput.classList.remove("is-invalid"));

    this.addButton = document.createElement("button");
    this.addButton.type = "submit";
    this.addButton.className = "btn btn-sm btn-outline-light flex-shrink-0";
    this.addButton.textContent = "Hinzufügen";

    form.append(this.labelInput, this.keyInput, this.addButton);

    this.listEl = document.createElement("div");
    this.listEl.className = "pt-1";
    this.listEl.style.overflow = "auto";
    this.listEl.style.flex = "1 1 auto";

    section.append(form, this.listEl);
    return section;
  }

  public override show(): void {
    super.show();
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.renderKeys(await fetchLicenceKeys());
    } catch (error) {
      if (error instanceof AdminUnauthorizedError) {
        return;
      }
      this.renderMessage("Lizenzschlüssel konnten nicht geladen werden.");
    }
  }

  private async submitKey(): Promise<void> {
    const label = this.labelInput.value.trim();
    const key = this.keyInput.value.trim();
    this.labelInput.classList.toggle("is-invalid", label.length === 0);
    this.keyInput.classList.toggle("is-invalid", key.length === 0);
    if (!label || !key) {
      return;
    }

    this.addButton.disabled = true;
    try {
      await addLicenceKey(key, label);
      this.labelInput.value = "";
      this.keyInput.value = "";
      Toast.show("Lizenzschlüssel hinzugefügt.", "success");
      await this.reload();
    } catch (error) {
      if (error instanceof AdminUnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Lizenzschlüssel konnte nicht hinzugefügt werden.";
      Toast.show(message, "error");
    } finally {
      this.addButton.disabled = false;
    }
  }

  private async removeKey(entry: LicenceKeyEntry): Promise<void> {
    const name = entry.label.trim() || entry.key;
    if (!window.confirm(`Lizenzschlüssel „${name}“ wirklich löschen?`)) {
      return;
    }

    try {
      await deleteLicenceKey(entry.key);
      Toast.show("Lizenzschlüssel gelöscht.", "success");
      await this.reload();
    } catch (error) {
      if (error instanceof AdminUnauthorizedError) {
        return;
      }
      const message = error instanceof Error ? error.message : "Lizenzschlüssel konnte nicht gelöscht werden.";
      Toast.show(message, "error");
    }
  }

  private renderKeys(keys: LicenceKeyEntry[]): void {
    if (!this.isVisible) {
      return;
    }

    this.listEl.replaceChildren();
    if (keys.length === 0) {
      this.renderMessage("Keine Lizenzschlüssel");
      return;
    }

    for (const entry of keys) {
      const row = document.createElement("div");
      row.className = "d-flex align-items-center gap-2 py-1 border-bottom border-secondary";

      const label = document.createElement("div");
      label.className = "text-light";
      label.style.width = "160px";
      label.style.flex = "0 0 auto";
      label.textContent = entry.label.trim() || "–";

      const key = document.createElement("div");
      key.className = "text-light font-monospace text-break";
      key.style.flex = "1 1 auto";
      key.textContent = entry.key;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-sm btn-outline-danger no-drag flex-shrink-0";
      remove.title = "Löschen";
      remove.setAttribute("aria-label", "Löschen");
      remove.innerHTML = '<i class="bi bi-trash"></i>';
      remove.addEventListener("click", () => {
        void this.removeKey(entry);
      });

      row.append(label, key, remove);
      this.listEl.appendChild(row);
    }
  }

  private renderMessage(message: string): void {
    this.listEl.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "text-muted";
    empty.textContent = message;
    this.listEl.appendChild(empty);
  }
}
