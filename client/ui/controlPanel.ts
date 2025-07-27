import { 
  startSimulation, 
  stopSimulation, 
  pauseSimulation, 
  resumeSimulation, 
  getSimulationStatus, 
  getActiveTrains 
} from '../network/api';
import { SimulationStatusDto } from '../network/dto';

export class ControlPanel {
  private container: HTMLDivElement;
  private statusContainer: HTMLDivElement;
  private controlsContainer: HTMLDivElement;
  private updateInterval: number | null = null;
  private isVisible: boolean = false;

  constructor() {
    this.container = this.createContainer();
    this.statusContainer = this.createStatusContainer();
    this.controlsContainer = this.createControlsContainer();
    
    this.container.appendChild(this.statusContainer);
    this.container.appendChild(this.controlsContainer);
    
    document.body.appendChild(this.container);
  }

  private createContainer(): HTMLDivElement {
    const container = document.createElement('div');
    container.id = 'controlPanel';
    container.className = 'position-absolute top-0 start-0 m-3 p-3 bg-dark text-light rounded shadow-lg';
    container.style.zIndex = '1000';
    container.style.minWidth = '300px';
    container.style.maxWidth = '400px';
    container.style.display = 'none';
    return container;
  }

  private createStatusContainer(): HTMLDivElement {
    const statusContainer = document.createElement('div');
    statusContainer.className = 'mb-3';
    
    const title = document.createElement('h6');
    title.className = 'mb-2 text-primary';
    title.textContent = 'Simulation Status';
    
    const statusGrid = document.createElement('div');
    statusGrid.className = 'row g-2';
    
    // Simulation time
    const timeCol = document.createElement('div');
    timeCol.className = 'col-6';
    timeCol.innerHTML = `
      <div class="small text-muted">Current Time</div>
      <div id="simulationTime" class="fw-bold">--:--</div>
    `;
    
    // Active trains
    const trainsCol = document.createElement('div');
    trainsCol.className = 'col-6';
    trainsCol.innerHTML = `
      <div class="small text-muted">Active Trains</div>
      <div id="activeTrainsCount" class="fw-bold">0</div>
    `;
    
    // Simulation status
    const statusCol = document.createElement('div');
    statusCol.className = 'col-12';
    statusCol.innerHTML = `
      <div class="small text-muted">Status</div>
      <div id="simulationStatus" class="fw-bold">Stopped</div>
    `;
    
    statusGrid.appendChild(timeCol);
    statusGrid.appendChild(trainsCol);
    statusGrid.appendChild(statusCol);
    
    statusContainer.appendChild(title);
    statusContainer.appendChild(statusGrid);
    
    return statusContainer;
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
    
    buttonGroup.appendChild(startResumeBtn);
    buttonGroup.appendChild(stopBtn);
    buttonGroup.appendChild(pauseBtn);
    
    controlsContainer.appendChild(title);
    controlsContainer.appendChild(buttonGroup);
    
    return controlsContainer;
  }

  public show(): void {
    this.container.style.display = 'block';
    this.isVisible = true;
    this.startStatusUpdates();
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
    this.stopStatusUpdates();
  }

  public toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  private startStatusUpdates(): void {
    this.updateStatus();
    this.updateInterval = window.setInterval(() => {
      this.updateStatus();
    }, 500); // Update every second
  }

  private stopStatusUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private async updateStatus(): Promise<void> {
    try {
      const [status, activeTrains] = await Promise.all([
        getSimulationStatus(),
        getActiveTrains()
      ]);

      // Update simulation time
      const timeElement = document.getElementById('simulationTime');
      if (timeElement) {
        const currentTime = new Date(status.currentTime);
        timeElement.textContent = currentTime.toLocaleTimeString();
      }

      // Update active trains count
      const trainsElement = document.getElementById('activeTrainsCount');
      if (trainsElement) {
        trainsElement.textContent = activeTrains.length.toString();
      }

      // Update simulation status
      const statusElement = document.getElementById('simulationStatus');
      if (statusElement) {
        let statusText: string;
        let statusClass: string;
        
        switch (status.state) {
          case 'Error':
            statusText = 'Error';
            statusClass = 'text-danger';
            break;
          case 'Paused':
            statusText = 'Paused';
            statusClass = 'text-warning';
            break;
          case 'Running':
            statusText = 'Running';
            statusClass = 'text-success';
            break;
          case 'Stopped':
          default:
            statusText = 'Stopped';
            statusClass = 'text-secondary';
            break;
        }
        
        statusElement.textContent = statusText;
        statusElement.className = `fw-bold ${statusClass}`;
      }

      // Show error message if there is one
      if (status.errorMessage) {
        console.error('Simulation error:', status.errorMessage);
        // You could also display this in the UI if desired
      }

      // Update button states
      this.updateButtonStates(status);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  }

  private updateButtonStates(status: SimulationStatusDto): void {
    const startResumeBtn = document.getElementById('startResumeBtn') as HTMLButtonElement;
    const pauseBtn = document.getElementById('pauseBtn') as HTMLButtonElement;
    
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
      await startSimulation();
      this.updateStatus();
    } catch (error) {
      console.error('Failed to start simulation:', error);
      alert('Failed to start simulation');
    }
  }

  private async handleStop(): Promise<void> {
    try {
      await stopSimulation();
      this.updateStatus();
    } catch (error) {
      console.error('Failed to stop simulation:', error);
      alert('Failed to stop simulation');
    }
  }

  private async handlePause(): Promise<void> {
    try {
      await pauseSimulation();
      this.updateStatus();
    } catch (error) {
      console.error('Failed to pause simulation:', error);
      alert('Failed to pause simulation');
    }
  }

  private async handleResume(): Promise<void> {
    try {
      await resumeSimulation();
      this.updateStatus();
    } catch (error) {
      console.error('Failed to resume simulation:', error);
      alert('Failed to resume simulation');
    }
  }

  public destroy(): void {
    this.stopStatusUpdates();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
} 