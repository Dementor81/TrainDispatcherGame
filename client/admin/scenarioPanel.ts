import {
   fetchScenarios,
   getCurrentScenario,
   setScenario,
} from "../network/api";
import { BasePanel } from "../ui/basePanel";

export class ScenarioPanel extends BasePanel {
   private allNetworks: string[] = [];
   private allScenarios: Array<{ id: string; title: string; networkId: string }> = [];
   private currentScenarioId: string = '';

   constructor() {
      super(null as any, null);
      
      // Fixed positioning for this singleton panel
      Object.assign(this.container.style, {
         position: 'fixed',
         top: '320px',
         left: '820px',
         width: '360px',
         height: '150px',
         display: 'block',
         minWidth: 'unset',
         maxWidth: 'unset',
      });
      
      void this.loadData();
   }

   protected createContent(): HTMLDivElement {
      const section = document.createElement('div');
      section.className = 'd-flex flex-column gap-3';
      
      // Network selector
      const networkRow = document.createElement('div');
      networkRow.className = 'd-flex align-items-center gap-2';
      const networkLabel = document.createElement('label');
      networkLabel.className = 'text-secondary small';
      networkLabel.style.width = '120px';
      networkLabel.textContent = 'Track Network:';
      networkLabel.setAttribute('for', 'networkSelect');
      const networkSelect = document.createElement('select');
      networkSelect.id = 'networkSelect';
      networkSelect.className = 'form-select form-select-sm flex-grow-1';
      networkSelect.addEventListener('change', () => this.updateScenarioDropdown());
      networkRow.appendChild(networkLabel);
      networkRow.appendChild(networkSelect);
      
      // Scenario selector
      const scenarioRow = document.createElement('div');
      scenarioRow.className = 'd-flex align-items-center gap-2';
      const scenarioLabel = document.createElement('label');
      scenarioLabel.className = 'text-secondary small';
      scenarioLabel.style.width = '120px';
      scenarioLabel.textContent = 'Scenario:';
      scenarioLabel.setAttribute('for', 'scenarioSelect');
      const scenarioSelect = document.createElement('select');
      scenarioSelect.id = 'scenarioSelect';
      scenarioSelect.className = 'form-select form-select-sm flex-grow-1';
      scenarioSelect.addEventListener('change', async () => {
         const id = scenarioSelect.value;
         if (id) {
            try {
               await setScenario(id);
               this.currentScenarioId = id;
            } catch (e) {
               console.error('Failed to set scenario', e);
            }
         }
      });
      scenarioRow.appendChild(scenarioLabel);
      scenarioRow.appendChild(scenarioSelect);
      
      section.appendChild(networkRow);
      section.appendChild(scenarioRow);
      return section;
   }
   
   private async loadData(): Promise<void> {
      try {
         const [scenarios, curr] = await Promise.all([
            fetchScenarios(),
            getCurrentScenario().catch(() => ({ id: '' }))
         ]);
         
         this.currentScenarioId = curr?.id ?? '';
         
         // Parse scenario IDs to extract network ID (format: networkId/scenarioName)
         this.allScenarios = scenarios.map(s => {
            const parts = s.id.split('/', 2);
            return {
               id: s.id,
               title: s.title || s.id,
               networkId: parts[0] || ''
            };
         });
         
         // Extract unique network IDs from scenarios
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
         console.error('Failed to load data', e);
      }
   }
   
   private updateNetworkDropdown(): void {
      const networkSelect = this.container.querySelector('#networkSelect') as HTMLSelectElement;
      if (!networkSelect) return;
      
      networkSelect.innerHTML = '';
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '-- Select Track Network --';
      networkSelect.appendChild(emptyOpt);
      
      for (const network of this.allNetworks) {
         const opt = document.createElement('option');
         opt.value = network;
         opt.textContent = network;
         
         // If we have a current scenario, select its network
         if (this.currentScenarioId) {
            const parts = this.currentScenarioId.split('/', 2);
            if (parts[0] === network) {
               opt.selected = true;
            }
         }
         
         networkSelect.appendChild(opt);
      }
   }
   
   private updateScenarioDropdown(): void {
      const networkSelect = this.container.querySelector('#networkSelect') as HTMLSelectElement;
      const scenarioSelect = this.container.querySelector('#scenarioSelect') as HTMLSelectElement;
      if (!networkSelect || !scenarioSelect) return;
      
      const selectedNetworkId = networkSelect.value;
      scenarioSelect.innerHTML = '';
      
      if (!selectedNetworkId) {
         const emptyOpt = document.createElement('option');
         emptyOpt.value = '';
         emptyOpt.textContent = '-- Select Track Network First --';
         scenarioSelect.appendChild(emptyOpt);
         return;
      }
      
      // Filter scenarios by selected network
      const filteredScenarios = this.allScenarios.filter(s => s.networkId === selectedNetworkId);
      
      if (filteredScenarios.length === 0) {
         const emptyOpt = document.createElement('option');
         emptyOpt.value = '';
         emptyOpt.textContent = '-- No Scenarios Available --';
         scenarioSelect.appendChild(emptyOpt);
         return;
      }
      
      for (const scenario of filteredScenarios) {
         const opt = document.createElement('option');
         opt.value = scenario.id;
         opt.textContent = scenario.title;
         if (scenario.id === this.currentScenarioId) {
            opt.selected = true;
         }
         scenarioSelect.appendChild(opt);
      }
   }
}

export default ScenarioPanel;

