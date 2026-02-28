import {
   fetchScenarios,
   getCurrentScenario,
   setScenario,
} from "../network/api";

export class scenarioSelectionDialog {
   private allNetworks: string[] = [];
   private allScenarios: Array<{ id: string; title: string; networkId: string }> = [];
   private currentScenarioId: string = "";
   private networkSelect: HTMLSelectElement;
   private scenarioSelect: HTMLSelectElement;
   private modalElement: HTMLDivElement;
   private modalInstance: any;

   constructor() {
      const ui = this.createModal();
      this.modalElement = ui.modal;
      this.networkSelect = ui.networkSelect;
      this.scenarioSelect = ui.scenarioSelect;
      document.body.appendChild(this.modalElement);

      this.modalInstance = new (window as any).bootstrap.Modal(this.modalElement, {
         backdrop: "static",
         keyboard: false
      });
      this.modalElement.addEventListener("hide.bs.modal", (event: Event) => {
         if (!this.isSelectionComplete()) {
            event.preventDefault();
         }
      });
      void this.loadData();
      this.show();
   }

   public show(): void {
      this.modalInstance.show();
   }

   private createModal(): {
      modal: HTMLDivElement;
      networkSelect: HTMLSelectElement;
      scenarioSelect: HTMLSelectElement;
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

      const networkRow = document.createElement("div");
      networkRow.className = "d-flex align-items-center gap-2";
      const networkLabel = document.createElement("label");
      networkLabel.className = "text-secondary small";
      networkLabel.style.width = "120px";
      networkLabel.textContent = "Spielnetz:";
      const networkSelect = document.createElement("select");
      networkSelect.className = "form-select form-select-sm flex-grow-1";
      networkSelect.addEventListener("change", () => this.updateScenarioDropdown());
      networkRow.appendChild(networkLabel);
      networkRow.appendChild(networkSelect);

      const scenarioRow = document.createElement("div");
      scenarioRow.className = "d-flex align-items-center gap-2";
      const scenarioLabel = document.createElement("label");
      scenarioLabel.className = "text-secondary small";
      scenarioLabel.style.width = "120px";
      scenarioLabel.textContent = "Scenario:";
      const scenarioSelect = document.createElement("select");
      scenarioSelect.className = "form-select form-select-sm flex-grow-1";
      scenarioSelect.addEventListener("change", async () => {
         const id = this.scenarioSelect.value;
         if (id) {
            try {
               await setScenario(id);
               this.currentScenarioId = id;
            } catch (e) {
               console.error("Failed to set scenario", e);
            }
         }
      });
      scenarioRow.appendChild(scenarioLabel);
      scenarioRow.appendChild(scenarioSelect);

      body.appendChild(networkRow);
      body.appendChild(scenarioRow);

      const footer = document.createElement("div");
      footer.className = "modal-footer border-secondary";
      const closeFooter = document.createElement("button");
      closeFooter.type = "button";
      closeFooter.className = "btn btn-secondary btn-sm";
      closeFooter.setAttribute("data-bs-dismiss", "modal");
      closeFooter.textContent = "Start Simulation";
      footer.appendChild(closeFooter);

      content.appendChild(header);
      content.appendChild(body);
      content.appendChild(footer);
      dialog.appendChild(content);
      modal.appendChild(dialog);

      return { modal, networkSelect, scenarioSelect };
   }

   private async loadData(): Promise<void> {
      try {
         const [scenarios, curr] = await Promise.all([
            fetchScenarios(),
            getCurrentScenario().catch(() => ({ id: "" }))
         ]);

         this.currentScenarioId = curr?.id ?? "";
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
      } catch (e) {
         console.error("Failed to load data", e);
      }
   }

   private updateNetworkDropdown(): void {
      this.networkSelect.innerHTML = "";
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '-- Select Track Network --';
      this.networkSelect.appendChild(emptyOpt);

      for (const network of this.allNetworks) {
         const opt = document.createElement('option');
         opt.value = network;
         opt.textContent = network;

         if (this.currentScenarioId) {
            const parts = this.currentScenarioId.split('/', 2);
            if (parts[0] === network) {
               opt.selected = true;
            }
         }

         this.networkSelect.appendChild(opt);
      }
   }

   private updateScenarioDropdown(): void {
      const selectedNetworkId = this.networkSelect.value;
      this.scenarioSelect.innerHTML = '';

      if (!selectedNetworkId) {
         const emptyOpt = document.createElement('option');
         emptyOpt.value = '';
         emptyOpt.textContent = '-- Select Track Network First --';
         this.scenarioSelect.appendChild(emptyOpt);
         return;
      }

      const filteredScenarios = this.allScenarios.filter(s => s.networkId === selectedNetworkId);

      if (filteredScenarios.length === 0) {
         const emptyOpt = document.createElement('option');
         emptyOpt.value = '';
         emptyOpt.textContent = '-- No Scenarios Available --';
         this.scenarioSelect.appendChild(emptyOpt);
         return;
      }

      for (const scenario of filteredScenarios) {
         const opt = document.createElement('option');
         opt.value = scenario.id;
         opt.textContent = scenario.title;
         if (scenario.id === this.currentScenarioId) {
            opt.selected = true;
         }
         this.scenarioSelect.appendChild(opt);
      }
   }

   private isSelectionComplete(): boolean {
      return this.networkSelect.value.trim().length > 0 && this.scenarioSelect.value.trim().length > 0;
   }
}

export default scenarioSelectionDialog;

