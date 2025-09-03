import {
   startSimulation,
   stopSimulation,
   pauseSimulation,
   resumeSimulation,
   resetSimulation,
   getSimulationStatus,
   advanceSimulationOneMinute,
   setSimulationSpeed,
   fetchScenarios,
   getCurrentScenario,
   setScenario,
} from "../network/api";
import { SimulationStatusDto } from "../network/dto";
import "winbox/dist/winbox.bundle.min.js";

export class AdminPanel extends (window as any).WinBox {
   private container: HTMLDivElement;

   constructor(options?: Partial<{ title: string; x: any; y: any; width: number; height: number }>) {
      const container = document.createElement("div");
      // pre-create content before super call uses mount
      const panel = new AdminPanelInternal(container);
      super({
         title: options?.title ?? "Server Control",
         x: options?.x ?? "center",
         y: options?.y ?? 60,
         width: options?.width ?? 440,
         height: options?.height ?? 300,
         background: "#212529",
         class: ["no-full", "modern", "no-max"],
         mount: container,
      });
      this.container = container;

      // Wire up button events
      const startBtn = this.container.querySelector("#adminStartResumeBtn") as HTMLButtonElement | null;
      const stopBtn = this.container.querySelector("#adminStopBtn") as HTMLButtonElement | null;
      const pauseBtn = this.container.querySelector("#adminPauseBtn") as HTMLButtonElement | null;
      const resumeBtn = this.container.querySelector("#adminResumeBtn") as HTMLButtonElement | null;
      const advanceBtn = this.container.querySelector("#adminAdvanceBtn") as HTMLButtonElement | null;
      const resetBtn = this.container.querySelector("#adminResetBtn") as HTMLButtonElement | null;
      const speedInput = this.container.querySelector('#adminSpeedInput') as HTMLInputElement | null;
      const speedApplyBtn = this.container.querySelector('#adminSpeedApply') as HTMLButtonElement | null;

      if (startBtn) startBtn.addEventListener("click", () => this.handleStart());
      if (stopBtn) stopBtn.addEventListener("click", () => this.handleStop());
      if (pauseBtn) pauseBtn.addEventListener("click", () => this.handlePause());
      if (resumeBtn) resumeBtn.addEventListener("click", () => this.handleResume());
      if (advanceBtn) advanceBtn.addEventListener("click", () => this.handleAdvanceMinute());
      if (resetBtn) resetBtn.addEventListener("click", () => this.handleReset());
      if (speedApplyBtn && speedInput) speedApplyBtn.addEventListener('click', () => this.handleApplySpeed(speedInput));
   }

   public getElement(): HTMLDivElement {
      return this.container;
   }

   public async update(): Promise<void> {
      try {
         const status = (await getSimulationStatus()) as SimulationStatusDto;       

         // button states
         const startBtn = this.container.querySelector("#adminStartResumeBtn") as HTMLButtonElement;
         const pauseBtn = this.container.querySelector("#adminPauseBtn") as HTMLButtonElement;
         const resumeBtn = this.container.querySelector("#adminResumeBtn") as HTMLButtonElement;
         if (startBtn && pauseBtn && resumeBtn) {
            startBtn.disabled = status.state === "Running";
            pauseBtn.disabled = status.state !== "Running";
            resumeBtn.disabled = status.state !== "Paused";
         }

         const speedInput = this.container.querySelector('#adminSpeedInput') as HTMLInputElement | null;
         if (speedInput && typeof status.speed === 'number') {
            speedInput.value = String(status.speed);
         }

         // do not refresh scenario selector periodically
      } catch (err) {
         console.error("AdminPanel: failed to update status", err);
      }
   }

   private async handleStart(): Promise<void> {
      await startSimulation();
      await this.update();
   }
   private async handleStop(): Promise<void> {
      await stopSimulation();
      await this.update();
   }
   private async handlePause(): Promise<void> {
      await pauseSimulation();
      await this.update();
   }
   private async handleResume(): Promise<void> {
      await resumeSimulation();
      await this.update();
   }
   private async handleReset(): Promise<void> {
      await resetSimulation();
      await this.update();
   }
   private async handleAdvanceMinute(): Promise<void> {
      await advanceSimulationOneMinute();
      await this.update();
   }

   private async handleApplySpeed(input: HTMLInputElement): Promise<void> {
      const value = parseInt(input.value, 10);
      if (!isNaN(value)) {
         await setSimulationSpeed(value);
         await this.update();
      }
   }
}

export default AdminPanel;

// Internal builder that assembles the panel content
class AdminPanelInternal {
   constructor(private host: HTMLDivElement) {
      this.init();
   }
   private init(): void {
      this.host.style.width = "100%";
      this.host.style.height = "100%";
      this.host.className = "p-3 text-light";
      this.host.appendChild(this.createControlsSection());
      this.host.appendChild(this.createScenarioSection());
   }

   private createControlsSection(): HTMLDivElement {
      const section = document.createElement("div");
      const title = document.createElement("h6");
      title.className = "mb-2 text-primary";
      title.textContent = "Controls";
      const group = document.createElement("div");
      group.className = "d-flex flex-wrap gap-1";
      const startBtn = this.button("Start", "btn-success");
      startBtn.id = "adminStartResumeBtn";
      const stopBtn = this.button("Stop", "btn-danger");
      stopBtn.id = "adminStopBtn";
      const pauseBtn = this.button("Pause", "btn-warning");
      pauseBtn.id = "adminPauseBtn";
      const resumeBtn = this.button("Resume", "btn-success");
      resumeBtn.id = "adminResumeBtn";
      const advanceBtn = this.button("+1 min", "btn-secondary");
      advanceBtn.id = "adminAdvanceBtn";
      const resetBtn = this.button("Reset", "btn-outline-light");
      resetBtn.id = "adminResetBtn";
      // Speed controls
      const speedWrap = document.createElement('div');
      speedWrap.className = 'd-flex align-items-center gap-1 ms-2';
      const speedLabel = document.createElement('span'); speedLabel.className = 'text-secondary small'; speedLabel.textContent = 'Speed:';
      const speedInput = document.createElement('input'); speedInput.type = 'number'; speedInput.min = '1'; speedInput.max = '100'; speedInput.step = '1'; speedInput.id = 'adminSpeedInput'; speedInput.className = 'form-control form-control-sm'; speedInput.style.width = '80px';
      const speedApply = this.button('Apply', 'btn-info'); speedApply.id = 'adminSpeedApply';
      speedWrap.appendChild(speedLabel); speedWrap.appendChild(speedInput); speedWrap.appendChild(speedApply);
      group.appendChild(startBtn);
      group.appendChild(stopBtn);
      group.appendChild(pauseBtn);
      group.appendChild(resumeBtn);
      group.appendChild(advanceBtn);
      group.appendChild(resetBtn);
      group.appendChild(speedWrap);
      section.appendChild(title);
      section.appendChild(group);
      return section;
   }
   private createScenarioSection(): HTMLDivElement {
      const section = document.createElement('div');
      section.className = 'mt-3';
      const title = document.createElement('h6');
      title.className = 'mb-2 text-primary';
      title.textContent = 'Scenario';
      const row = document.createElement('div');
      row.className = 'd-flex flex-wrap align-items-center gap-2';
      const label = document.createElement('span'); label.className = 'text-secondary small'; label.textContent = 'Current:';
      const current = document.createElement('span'); current.id = 'adminScenarioCurrent'; current.className = 'text-light small'; current.textContent = '-';
      const select = document.createElement('select'); select.id = 'adminScenarioSelect'; select.className = 'form-select form-select-sm'; select.style.width = '240px';
      const apply = this.button('Apply', 'btn-info'); apply.id = 'adminScenarioApply';
      apply.addEventListener('click', async () => {
         const id = select.value;
         if (id) {
            try {
               await setScenario(id);
               current.textContent = id;
            } catch (e) {
               console.error('Failed to set scenario', e);
            }
         }
      });
      row.appendChild(label); row.appendChild(current); row.appendChild(select); row.appendChild(apply);
      section.appendChild(title);
      section.appendChild(row);

      // Load once on init
      (async () => {
         try {
            const [scenarios, curr] = await Promise.all([
               fetchScenarios(),
               getCurrentScenario().catch(() => ({ id: '' }))
            ]);
            const currentId = curr?.id ?? '';
            current.textContent = currentId || '-';
            select.innerHTML = '';
            for (const s of scenarios) {
               const opt = document.createElement('option');
               opt.value = s.id;
               opt.text = `${s.title || s.id}`;
               if (s.id === currentId) opt.selected = true;
               select.appendChild(opt);
            }
         } catch (e) {
            console.error('Failed to load scenarios', e);
         }
      })();
      return section;
   }
   private button(text: string, cls: string): HTMLButtonElement {
      const btn = document.createElement("button");
      btn.className = `btn btn-sm ${cls}`;
      btn.textContent = text;
      return btn;
   }
}
