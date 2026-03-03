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
import { BasePanel } from "./basePanel";
import { Application } from "../core/application";
import { UI } from "../utils/ui";

export class ControlPanel extends BasePanel {
   private controlsContainer: HTMLDivElement;

   constructor(application: Application) {
      super(application, {
         updateIntervalMs: 1000,
         width: 550,
         bottom: 0,
         left: 0,
      });
      this.controlsContainer = this.createControlsContainer();
      this.container.appendChild(this.controlsContainer);
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
      const startResumeBtn = UI.createButton("btn-success btn-sm", "Start", () => this.handleStart());
      startResumeBtn.id = "startResumeBtn";
      startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
      startResumeBtn.style.width = "100px";

      // Stop button
      const stopBtn = UI.createButton("btn-danger btn-sm", "Stop", () => this.handleStop());
      stopBtn.innerHTML = '<i class="bi bi-stop-fill"></i> Stop';
      stopBtn.style.width = "100px";

      // Pause button
      const pauseBtn = UI.createButton("btn-warning btn-sm", "Pause", () => this.handlePause());
      pauseBtn.id = "pauseBtn";
      pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i> Pause';
      pauseBtn.style.width = "100px";

      // Advance time by one minute
      const advanceBtn = UI.createButton("btn-secondary btn-sm", "+1 min", () => this.handleAdvanceMinute());
      advanceBtn.id = "advanceBtn";
      advanceBtn.innerHTML = '<i class="bi bi-fast-forward-fill"></i> +1 min';

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
      speedWrap.append(speedLabel, speedInput);

      buttonGroup.append(startResumeBtn, stopBtn, pauseBtn, advanceBtn, speedWrap);
      controlsContainer.append(buttonGroup);

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
