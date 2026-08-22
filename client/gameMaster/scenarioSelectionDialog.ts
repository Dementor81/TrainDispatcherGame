import { fetchScenarios, startGameSession } from "../network/api";
import { UI } from "../utils/ui";

export class ScenarioSelectionDialog {
   private allNetworks: string[] = [];
   private allScenarios: Array<{ id: string; title: string; networkId: string }> = [];
   private networkSelect: HTMLSelectElement;
   private scenarioSelect: HTMLSelectElement;
   private confirmButton: HTMLButtonElement;
   private errorElement: HTMLParagraphElement;
   private modalElement: HTMLDivElement;
   private modalInstance: any;
   private created = false;
   private submitting = false;

   constructor(private readonly options: { gameCode: string; onCreated: (gameCode: string) => void }) {
      const ui = this.createModal();
      this.modalElement = ui.modal;
      this.networkSelect = ui.networkSelect;
      this.scenarioSelect = ui.scenarioSelect;
      this.confirmButton = ui.confirmButton;
      this.errorElement = ui.errorElement;
      document.body.appendChild(this.modalElement);

      this.modalInstance = new (window as any).bootstrap.Modal(this.modalElement, {
         backdrop: "static",
         keyboard: false
      });
      this.modalElement.addEventListener("hide.bs.modal", (event: Event) => {
         if (!this.created) {
            event.preventDefault();
         }
      });
      this.modalElement.addEventListener("hidden.bs.modal", () => {
         if (this.created) {
            this.options.onCreated(this.options.gameCode);
         }
      });
      void this.loadData();
      this.modalInstance.show();
   }

   private createModal(): {
      modal: HTMLDivElement;
      networkSelect: HTMLSelectElement;
      scenarioSelect: HTMLSelectElement;
      confirmButton: HTMLButtonElement;
      errorElement: HTMLParagraphElement;
   } {
      const modal = document.createElement("div");
      modal.className = "modal fade";
      modal.tabIndex = -1;
      modal.setAttribute("aria-hidden", "true");

      const dialog = document.createElement("div");
      dialog.className = "modal-dialog modal-dialog-centered";

      const content = document.createElement("div");
      content.className = "modal-content bg-dark text-light";

      const header = document.createElement("div");
      header.className = "modal-header border-secondary";
      const title = document.createElement("h5");
      title.className = "modal-title";
      title.textContent = "Szenario";
      header.appendChild(title);

      const body = document.createElement("div");
      body.className = "modal-body d-flex flex-column gap-3";

      const help = document.createElement("p");
      help.className = "text-secondary small mb-0";
      help.textContent = "Wähle das Streckennetz und das Szenario, das du spielen möchtest. Anschließend können die Spieler dem Spiel beitreten.";
      body.appendChild(help);

      const networkRow = document.createElement("div");
      networkRow.className = "d-flex align-items-center gap-2";
      const networkLabel = document.createElement("label");
      networkLabel.className = "text-secondary small";
      networkLabel.style.width = "120px";
      networkLabel.textContent = "Spielnetz:";
      const networkSelect = document.createElement("select");
      networkSelect.className = "form-select form-select-sm flex-grow-1";
      networkSelect.addEventListener("change", () => {
         this.updateScenarioDropdown();
         this.syncConfirmEnabled();
      });
      networkRow.appendChild(networkLabel);
      networkRow.appendChild(networkSelect);

      const scenarioRow = document.createElement("div");
      scenarioRow.className = "d-flex align-items-center gap-2";
      const scenarioLabel = document.createElement("label");
      scenarioLabel.className = "text-secondary small";
      scenarioLabel.style.width = "120px";
      scenarioLabel.textContent = "Szenario:";
      const scenarioSelect = document.createElement("select");
      scenarioSelect.className = "form-select form-select-sm flex-grow-1";
      scenarioSelect.addEventListener("change", () => {
         this.syncConfirmEnabled();
      });
      scenarioRow.appendChild(scenarioLabel);
      scenarioRow.appendChild(scenarioSelect);

      const errorElement = document.createElement("p");
      errorElement.className = "text-danger small mb-0 d-none";

      body.appendChild(networkRow);
      body.appendChild(scenarioRow);
      body.appendChild(errorElement);

      const footer = document.createElement("div");
      footer.className = "modal-footer border-secondary";
      const confirmButton = UI.createButton("btn-primary btn-sm", "Szenario wählen", () => {
         void this.confirmSelection();
      });
      confirmButton.disabled = true;
      footer.appendChild(confirmButton);

      content.appendChild(header);
      content.appendChild(body);
      content.appendChild(footer);
      dialog.appendChild(content);
      modal.appendChild(dialog);

      return { modal, networkSelect, scenarioSelect, confirmButton, errorElement };
   }

   private async loadData(): Promise<void> {
      try {
         const scenarios = await fetchScenarios();

         this.allScenarios = scenarios.map(s => {
            const parts = s.id.split("/", 2);
            return {
               id: s.id,
               title: s.title || s.id,
               networkId: parts[0] || ""
            };
         });

         const uniqueNetworks = new Set<string>();
         for (const scenario of this.allScenarios) {
            if (scenario.networkId) {
               uniqueNetworks.add(scenario.networkId);
            }
         }
         this.allNetworks = Array.from(uniqueNetworks).sort();

         this.updateNetworkDropdown();
         this.updateScenarioDropdown();
         this.syncConfirmEnabled();
      } catch (e) {
         console.error("Failed to load data", e);
         this.showError("Szenarien konnten nicht geladen werden.");
      }
   }

   private updateNetworkDropdown(): void {
      this.networkSelect.innerHTML = "";
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "-- Spielnetz wählen --";
      this.networkSelect.appendChild(emptyOpt);

      for (const network of this.allNetworks) {
         const opt = document.createElement("option");
         opt.value = network;
         opt.textContent = network;
         this.networkSelect.appendChild(opt);
      }
   }

   private updateScenarioDropdown(): void {
      const selectedNetworkId = this.networkSelect.value;
      this.scenarioSelect.innerHTML = "";

      if (!selectedNetworkId) {
         const emptyOpt = document.createElement("option");
         emptyOpt.value = "";
         emptyOpt.textContent = "-- Zuerst Spielnetz wählen --";
         this.scenarioSelect.appendChild(emptyOpt);
         return;
      }

      const filteredScenarios = this.allScenarios.filter(s => s.networkId === selectedNetworkId);

      if (filteredScenarios.length === 0) {
         const emptyOpt = document.createElement("option");
         emptyOpt.value = "";
         emptyOpt.textContent = "-- Keine Szenarien vorhanden --";
         this.scenarioSelect.appendChild(emptyOpt);
         return;
      }

      for (const scenario of filteredScenarios) {
         const opt = document.createElement("option");
         opt.value = scenario.id;
         opt.textContent = scenario.title;
         this.scenarioSelect.appendChild(opt);
      }

      this.scenarioSelect.value = filteredScenarios[0].id;
   }

   private async confirmSelection(): Promise<void> {
      if (this.submitting || !this.isSelectionComplete()) {
         return;
      }

      const scenarioId = this.scenarioSelect.value;
      this.submitting = true;
      this.setFormDisabled(true);
      this.clearError();

      try {
         await startGameSession(this.options.gameCode, scenarioId);
         this.created = true;
         this.modalInstance.hide();
      } catch (e) {
         const message = e instanceof Error ? e.message : "Sitzung konnte nicht erstellt werden.";
         this.showError(message);
         this.submitting = false;
         this.setFormDisabled(false);
         this.syncConfirmEnabled();
      }
   }

   private setFormDisabled(disabled: boolean): void {
      this.networkSelect.disabled = disabled;
      this.scenarioSelect.disabled = disabled;
      this.confirmButton.disabled = disabled;
   }

   private syncConfirmEnabled(): void {
      if (this.submitting) {
         return;
      }
      this.confirmButton.disabled = !this.isSelectionComplete();
   }

   private isSelectionComplete(): boolean {
      return this.networkSelect.value.trim().length > 0 && this.scenarioSelect.value.trim().length > 0;
   }

   private showError(message: string): void {
      this.errorElement.textContent = message;
      this.errorElement.classList.remove("d-none");
   }

   private clearError(): void {
      this.errorElement.textContent = "";
      this.errorElement.classList.add("d-none");
   }
}

export default ScenarioSelectionDialog;
