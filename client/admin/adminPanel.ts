import {
   startSimulation,
   stopSimulation,
   pauseSimulation,
   resumeSimulation,
   resetSimulation,
   getSimulationStatus,
   advanceSimulationOneMinute,
   setSimulationSpeed,
} from "../network/api";
import { SimulationStatusDto } from "../network/dto";
import "winbox/dist/winbox.bundle.min.js";

export class AdminPanel extends (window as any).WinBox {
   private container: HTMLDivElement;
   private updateTimer: number | null = null;

   constructor(options?: Partial<{ title: string; x: any; y: any; width: number; height: number }>) {
      const container = document.createElement("div");
      // pre-create content before super call uses mount
      const panel = new AdminPanelInternal(container);
      super({
         title: options?.title ?? "Server Control",
         x: options?.x ?? "center",
         y: options?.y ?? 60,
         width: options?.width ?? 440,
         height: options?.height ?? 150,
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

      // Start periodic self-update and cleanup on close
      void this.update();
      this.updateTimer = window.setInterval(() => this.update(), 2000);
      // Use WinBox onclose callback for cleanup
      (this as any).onclose = () => {
         if (this.updateTimer !== null) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
         }
      };
   }

   public getElement(): HTMLDivElement {
      return this.container;
   }

   public async update(): Promise<void> {
      try {
         const status = (await getSimulationStatus()) as SimulationStatusDto;       
         this.updateButtonStates(status);
         this.updateSpeedInput(status);
      } catch (err) {
         console.error("AdminPanel: failed to update status", err);
      }
   }

   private updateButtonStates(status: SimulationStatusDto): void {
      const startBtn = this.container.querySelector("#adminStartResumeBtn") as HTMLButtonElement;
      const pauseBtn = this.container.querySelector("#adminPauseBtn") as HTMLButtonElement;
      const resumeBtn = this.container.querySelector("#adminResumeBtn") as HTMLButtonElement;
      if (startBtn && pauseBtn && resumeBtn) {
         startBtn.disabled = status.state === "Running";
         pauseBtn.disabled = status.state !== "Running";
         resumeBtn.disabled = status.state !== "Paused";
      }
   }

   private updateSpeedInput(status: SimulationStatusDto): void {
      const speedInput = this.container.querySelector('#adminSpeedInput') as HTMLInputElement | null;
      if (!speedInput || typeof status.speed !== 'number') return;
      const newValue = String(status.speed);
      const isFocused = document.activeElement === speedInput;
      if (!isFocused && speedInput.value !== newValue) {
         speedInput.value = newValue;
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
   }

   private createControlsSection(): HTMLDivElement {
      const section = document.createElement("div");      
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
      section.appendChild(group);
      return section;
   }
   private button(text: string, cls: string): HTMLButtonElement {
      const btn = document.createElement("button");
      btn.className = `btn btn-sm ${cls}`;
      btn.textContent = text;
      return btn;
   }
}
