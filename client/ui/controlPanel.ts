import { 
  startSimulation, 
  stopSimulation, 
  pauseSimulation, 
  resumeSimulation, 
  getSimulationStatus,
  advanceSimulationOneMinute 
} from '../network/api';
import { SimulationStatusDto } from '../network/dto';
import { TrainManager } from '../manager/train_manager';
import { BasePanel } from './basePanel';
import { Application } from '../core/application';

export class ControlPanel extends BasePanel {
  private controlsContainer: HTMLDivElement;
  private trainManager: TrainManager | null = null;

  constructor(application: Application) {
    super(application, 500);
    this.trainManager = application.trainManager;
    this.controlsContainer = this.createControlsContainer();
    this.container.appendChild(this.controlsContainer);
  }

  protected getContainerId(): string { return 'controlPanel'; }
  protected getContainerClasses(): string { return super.getContainerClasses() + ' bottom-0 start-0'; }

  protected createContent(): HTMLDivElement {
    // This is not used in ControlPanel as we manually add status and controls containers
    const content = document.createElement('div');
    return content;
  }  

  private createControlsContainer(): HTMLDivElement {
    const controlsContainer = document.createElement('div');
    
    const title = document.createElement('h6');
    title.className = 'mb-2 text-primary';
    title.textContent = 'Controls';
    
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'd-flex flex-wrap gap-1';
    
    // Start/Resume button (context-aware)
    const startResumeBtn = document.createElement('button');
    startResumeBtn.id = 'startResumeBtn';
    startResumeBtn.className = 'btn btn-success btn-sm';
    startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
    startResumeBtn.onclick = () => this.handleStart();
    
    // Stop button
    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn btn-danger btn-sm';
    stopBtn.innerHTML = '<i class="bi bi-stop-fill"></i> Stop';
    stopBtn.onclick = () => this.handleStop();
    
    // Pause button
    const pauseBtn = document.createElement('button');
    pauseBtn.id = 'pauseBtn';
    pauseBtn.className = 'btn btn-warning btn-sm';
    pauseBtn.innerHTML = '<i class="bi bi-pause-fill"></i> Pause';
    pauseBtn.onclick = () => this.handlePause();

    // Advance time by one minute
    const advanceBtn = document.createElement('button');
    advanceBtn.id = 'advanceBtn';
    advanceBtn.className = 'btn btn-secondary btn-sm';
    advanceBtn.innerHTML = '<i class="bi bi-fast-forward-fill"></i> +1 min';
    advanceBtn.onclick = () => this.handleAdvanceMinute();
    
    buttonGroup.appendChild(startResumeBtn);
    buttonGroup.appendChild(stopBtn);
    buttonGroup.appendChild(pauseBtn);
    buttonGroup.appendChild(advanceBtn);
    
    controlsContainer.appendChild(title);
    controlsContainer.appendChild(buttonGroup);
    
    return controlsContainer;
  }

  protected async Updates(): Promise<void> {
    await this.updateStatus();
  }

  private async updateStatus(): Promise<void> {
    try {
      const [status] = await Promise.all([
        getSimulationStatus()
      ]); 

      // Update button states
      this.updateButtonStates(status);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  }

  private updateButtonStates(status: SimulationStatusDto): void {
    const startResumeBtn = document.getElementById('startResumeBtn') as HTMLButtonElement;
    const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
    const advanceBtn = document.getElementById('advanceBtn') as HTMLButtonElement;
    
    if (startResumeBtn) {
      switch (status.state) {
        case 'Error':
        case 'Stopped':
          startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
          startResumeBtn.onclick = () => this.handleStart();
          startResumeBtn.disabled = false;
          break;
        case 'Paused':
          startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Resume';
          startResumeBtn.onclick = () => this.handleResume();
          startResumeBtn.disabled = false;
          break;
        case 'Running':
          startResumeBtn.innerHTML = '<i class="bi bi-play-fill"></i> Start';
          startResumeBtn.onclick = () => this.handleStart();
          startResumeBtn.disabled = true; // Already running
          break;
      }
    }
    
    if (pauseBtn) {
      pauseBtn.disabled = status.state !== 'Running';
    }

    
  }

  private async handleStart(): Promise<void> {
    try {
      // Start server simulation
      await startSimulation();
      
      // Start client simulation if train manager is available
      if (this.trainManager) {
        this.trainManager.startSimulation();
      }
      
      this.updateStatus();
    } catch (error) {
      console.error('Failed to start simulation:', error);
      alert('Failed to start simulation');
    }
  }

  private async handleStop(): Promise<void> {
    try {
      // Stop server simulation
      await stopSimulation();
      
      // Stop client simulation if train manager is available
      if (this.trainManager) {
        this.trainManager.stopSimulation();
      }
      
      this.updateStatus();
    } catch (error) {
      console.error('Failed to stop simulation:', error);
      alert('Failed to stop simulation');
    }
  }

  private async handlePause(): Promise<void> {
    try {
      // Pause server simulation
      await pauseSimulation();
      
      // Stop client simulation if train manager is available
      if (this.trainManager) {
        this.trainManager.pauseSimulation();
      }
      
      this.updateStatus();
    } catch (error) {
      console.error('Failed to pause simulation:', error);
      alert('Failed to pause simulation');
    }
  }

  private async handleResume(): Promise<void> {
    try {
      // Resume server simulation
      await resumeSimulation();
      
      // Start client simulation if train manager is available
      if (this.trainManager) {
        this.trainManager.resumeSimulation();
      }
      
      this.updateStatus();
    } catch (error) {
      console.error('Failed to resume simulation:', error);
      alert('Failed to resume simulation');
    }
  }

  private async handleAdvanceMinute(): Promise<void> {
    try {
      await advanceSimulationOneMinute();
      await this.updateStatus();
    } catch (error) {
      console.error('Failed to advance simulation:', error);
      alert('Failed to advance simulation time');
    }
  }


} 