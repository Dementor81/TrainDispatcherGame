import {
   startSimulation,
   stopSimulation,
   pauseSimulation,
   resumeSimulation,
   getSimulationStatus,
   advanceSimulationOneMinute,
   setSimulationSpeed,
} from "../network/api";
import { SimulationStatusDto } from "../network/dto";
import { TrainManager } from "../manager/train_manager";
import { BasePanel } from "./basePanel";
import { Application } from "../core/application";

export class ControlPanel extends BasePanel {
   private controlsContainer: HTMLDivElement;
   private trainManager: TrainManager | null = null;

   constructor(application: Application) {
      super(application, 500);
      this.trainManager = application.trainManager;
      this.controlsContainer = this.createControlsContainer();
      this.container.appendChild(this.controlsContainer);
   }

   protected getContainerId(): string {
      return "controlPanel";
   }
   protected getContainerClasses(): string {
      return super.getContainerClasses();
   }
   protected getContainerStyles(): Partial<CSSStyleDeclaration> {
      return {
         ...super.getContainerStyles(),
         left: "0",
         bottom: "0",
         width: "550px",
         maxWidth: "550px",
      };
   }

   protected createContent(): HTMLDivElement {
      // This is not used in ControlPanel as we manually add status and controls containers
      const content = document.createElement("div");
      return content;
   }

   private createControlsContainer(): HTMLDivElement {
      const controlsContainer = document.createElement("div");

      const buttonGroup = document.createElement("div");
      buttonGroup.className = "d-flex flex-wrap gap-1";

      // Start/Resume button (context-aware)
      const startResumeBtn = document.createElement("button");
      startResumeBtn.id = "startResumeBtn";
      startResumeBtn.className = "btn btn-success btn-sm";
      startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
      startResumeBtn.onclick = () => this.handleStart();
      startResumeBtn.style.width = "100px";

      // Stop button
      const stopBtn = document.createElement("button");
      stopBtn.className = "btn btn-danger btn-sm";
      stopBtn.innerHTML = '<i class="bi bi-stop-fill"></i> Stop';
      stopBtn.onclick = () => this.handleStop();
      stopBtn.style.width = "100px";

      // Pause button
      const pauseBtn = document.createElement("button");
      pauseBtn.id = "pauseBtn";
      pauseBtn.className = "btn btn-warning btn-sm";
      pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i> Pause';
      pauseBtn.style.width = "100px";
      pauseBtn.onclick = () => this.handlePause();

      // Advance time by one minute
      const advanceBtn = document.createElement("button");
      advanceBtn.id = "advanceBtn";
      advanceBtn.className = "btn btn-secondary btn-sm";
      advanceBtn.innerHTML = '<i class="bi bi-fast-forward-fill"></i> +1 min';
      advanceBtn.onclick = () => this.handleAdvanceMinute();

      // Speed control
      const speedWrap = document.createElement("div");
      speedWrap.className = "d-flex align-items-center gap-1 ms-2";
      const speedLabel = document.createElement("span");
      speedLabel.className = "text-secondary small";
      speedLabel.textContent = "Speed:";
      const speedInput = document.createElement("input");
      speedInput.type = "number";
      speedInput.min = "1";
      speedInput.max = "5";
      speedInput.step = "1";
      speedInput.id = "speedInput";
      speedInput.className = "form-control form-control-sm";
      speedInput.style.width = "60px";
      speedInput.onchange = () => this.handleSpeedChange(speedInput);
      speedWrap.appendChild(speedLabel);
      speedWrap.appendChild(speedInput);

      buttonGroup.appendChild(startResumeBtn);
      buttonGroup.appendChild(stopBtn);
      buttonGroup.appendChild(pauseBtn);
      buttonGroup.appendChild(advanceBtn);
      buttonGroup.appendChild(speedWrap);

      controlsContainer.appendChild(buttonGroup);

      return controlsContainer;
   }

   protected async Updates(): Promise<void> {
      await this.updateStatus();
   }

   private async updateStatus(): Promise<void> {
      try {
         const [status] = await Promise.all([getSimulationStatus()]);

         // Update button states
         this.updateButtonStates(status);
         this.updateSpeedInput(status);
      } catch (error) {
         console.error("Failed to update status:", error);
      }
   }

   private updateButtonStates(status: SimulationStatusDto): void {
      const startResumeBtn = document.getElementById("startResumeBtn") as HTMLButtonElement;
      const pauseBtn = document.getElementById("pauseBtn") as HTMLButtonElement;

      switch (status.state) {
         case "Error":
         case "Stopped":
            startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
            startResumeBtn.onclick = () => this.handleStart();
            startResumeBtn.disabled = false;

            pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i> Pause';
            pauseBtn.onclick = null;
            pauseBtn.disabled = true;
            break;
         case "Paused":
            startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
            startResumeBtn.onclick = () => this.handleResume();
            startResumeBtn.disabled = false;

            pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i> Resume';
            pauseBtn.onclick = () => this.handleResume();
            pauseBtn.disabled = false;
            break;
         case "Running":
            startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
            startResumeBtn.onclick = null;
            startResumeBtn.disabled = true; // Already running

            pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i> Pause';
            pauseBtn.onclick = () => this.handlePause();
            pauseBtn.disabled = false;
            break;
      }
   }

   private async handleStart(): Promise<void> {
      try {
         // Start server simulation
         // The server will notify all clients via SignalR about the state change
         // and the Application's event handler will update the clientSimulation
         await startSimulation();

         this.updateStatus();
      } catch (error) {
         console.error("Failed to start simulation:", error);
         alert("Failed to start simulation");
      }
   }

   private async handleStop(): Promise<void> {
      try {
         // Stop server simulation
         // The server will notify all clients via SignalR about the state change
         // and the Application's event handler will update the clientSimulation
         await stopSimulation();

         this.updateStatus();
      } catch (error) {
         console.error("Failed to stop simulation:", error);
         alert("Failed to stop simulation");
      }
   }

   private async handlePause(): Promise<void> {
      try {
         // Pause server simulation
         // The server will notify all clients via SignalR about the state change
         // and the Application's event handler will update the clientSimulation
         await pauseSimulation();

         this.updateStatus();
      } catch (error) {
         console.error("Failed to pause simulation:", error);
         alert("Failed to pause simulation");
      }
   }

   private async handleResume(): Promise<void> {
      try {
         // Resume server simulation
         // The server will notify all clients via SignalR about the state change
         // and the Application's event handler will update the clientSimulation
         await resumeSimulation();

         this.updateStatus();
      } catch (error) {
         console.error("Failed to resume simulation:", error);
         alert("Failed to resume simulation");
      }
   }

   private async handleAdvanceMinute(): Promise<void> {
      try {
         await advanceSimulationOneMinute();
         await this.updateStatus();
      } catch (error) {
         console.error("Failed to advance simulation:", error);
         alert("Failed to advance simulation time");
      }
   }

   private updateSpeedInput(status: SimulationStatusDto): void {
      const speedInput = document.getElementById("speedInput") as HTMLInputElement | null;
      if (!speedInput || typeof status.speed !== "number") return;
      const newValue = String(status.speed);
      const isFocused = document.activeElement === speedInput;
      if (!isFocused && speedInput.value !== newValue) {
         speedInput.value = newValue;
      }
   }

   private async handleSpeedChange(input: HTMLInputElement): Promise<void> {
      const value = parseInt(input.value, 10);
      if (!isNaN(value)) {
         try {
            await setSimulationSpeed(value);
            await this.updateStatus();
         } catch (error) {
            console.error("Failed to set simulation speed:", error);
            alert("Failed to set simulation speed");
         }
      }
   }
}
