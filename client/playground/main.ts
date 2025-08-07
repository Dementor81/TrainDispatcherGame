// Import styles
import '../styles/main.css';
import './playground.css';

// Import components from the main application
import { TrackLayoutManager } from '../manager/trackLayout_manager';
import { EventManager } from '../manager/event_manager';
import { TrainManager } from '../manager/train_manager';
import { Renderer } from '../canvas/renderer';
import { UIManager } from '../manager/ui_manager';
import Storage from '../core/storage';
import Track from '../sim/track';
import Switch from '../sim/switch';
import Exit from '../sim/exit';
import Train from '../sim/train';

// API for loading actual layout files
class LayoutApi {
    async fetchLayout(layoutId: string) {
        try {
            // Import the JSON files directly
            let layoutData: any;
            
            if (layoutId === 'a_stadt') {
                layoutData = await import('./a_stadt.json');
            } else if (layoutId === 'b_stadt') {
                layoutData = await import('./b_stadt.json');
            } else {
                throw new Error(`Layout ${layoutId} not found`);
            }
            
            return layoutData.default || layoutData;
        } catch (error) {
            console.error(`Error loading layout ${layoutId}:`, error);
            throw new Error(`Layout ${layoutId} not found or invalid`);
        }
    }
}

// Playground Application class
class PlaygroundApplication {
    public trackLayoutManager: TrackLayoutManager;
    public eventManager: EventManager;
    public trainManager: TrainManager;
    public uiManager: UIManager;
    public renderer: Renderer | null = null;
    public currentLayout: any = null;
    public layoutApi: LayoutApi;
    public debugMode: boolean = false;
    public trains: Train[] = [];
    public testResults: HTMLElement | null = null;
    public testResultsPanel: HTMLElement | null = null;

    constructor() {
        this.trackLayoutManager = new TrackLayoutManager(this as any);
        this.eventManager = new EventManager(this as any);
        this.trainManager = new TrainManager(this.eventManager, this.trackLayoutManager);
        this.uiManager = new UIManager(this as any);
        this.layoutApi = new LayoutApi();
        
        this.testResults = document.getElementById('testResults');
        this.testResultsPanel = document.getElementById('testResultsPanel');
        
        this.init();
    }

    async init() {        
        
        // Initialize renderer
        const canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
        if (canvas) {
            this.renderer = new Renderer(canvas, this.trackLayoutManager, this.eventManager);
            this.trackLayoutManager.setRenderer(this.renderer);
        }

        // Initialize UI manager
        this.uiManager.init();

        // Initialize dropdowns
        this.updateExitSelect();

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Layout controls
        const loadLayoutBtn = document.getElementById('loadLayoutBtn');
        if (loadLayoutBtn) {
            loadLayoutBtn.addEventListener('click', () => {
                this.loadLayout();
            });
        }



        // Train controls
        const addTrainBtn = document.getElementById('addTrainBtn');
        if (addTrainBtn) {
            addTrainBtn.addEventListener('click', () => {
                this.addTrain();
            });
        }

        const clearTrainsBtn = document.getElementById('clearTrainsBtn');
        if (clearTrainsBtn) {
            clearTrainsBtn.addEventListener('click', () => {
                this.clearTrains();
            });
        }

        

        // Simulation controls
        const startSimBtn = document.getElementById('startSimBtn');
        if (startSimBtn) {
            startSimBtn.addEventListener('click', () => {
                this.startSimulation();
            });
        }

        const stopSimBtn = document.getElementById('stopSimBtn');
        if (stopSimBtn) {
            stopSimBtn.addEventListener('click', () => {
                this.stopSimulation();
            });
        }

        const speedSlider = document.getElementById('speedSlider') as HTMLInputElement;
        const speedDisplay = document.getElementById('speedDisplay');
        if (speedSlider && speedDisplay) {
            speedSlider.addEventListener('input', () => {
                const speed = parseFloat(speedSlider.value);
                this.trainManager.setSimulationSpeed(speed);
                speedDisplay.textContent = `${speed.toFixed(1)}x`;
            });
        }

        // Panel controls
        const minimizeResultsBtn = document.getElementById('minimizeResultsBtn');
        if (minimizeResultsBtn) {
            minimizeResultsBtn.addEventListener('click', () => {
                this.toggleResultsPanel();
            });
        }



         // Listen for train events and update renderer
        this.eventManager.on('trainAdded', (train: Train) => {
            this.renderer?.renderTrains(this.trainManager.getAllTrains());
        });

        // Listen for simulation updates and update renderer
        this.eventManager.on('trainsUpdated', (trains: Train[]) => {
            this.renderer?.renderTrains(trains);
        });

        // Listen for trains cleared event
        this.eventManager.on('trainsCleared', () => {
            this.renderer?.renderTrains([]);
        });
    }

    async loadLayout() {
        const layoutSelect = document.getElementById('layoutSelect') as HTMLSelectElement;
        if (!layoutSelect) return;
        
        const layoutId = layoutSelect.value;
        
        
        try {
            // Load the actual layout file
            const layoutData = await this.layoutApi.fetchLayout(layoutId);
            
            // Load the layout using Storage
            const trackLayout = Storage.loadTrackLayoutFromJson(layoutData);
            if (trackLayout) {
                this.currentLayout = trackLayout;
                
                this.trackLayoutManager.tracks.push(...trackLayout.tracks);
                this.trackLayoutManager.switches.push(...trackLayout.switches);
                this.trackLayoutManager.exits.push(...trackLayout.exits);
                this.updateExitSelect();
                this.renderer?.renderTrackLayout();
                
            } else {
                console.error("Failed to load layout");
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`Error loading layout: ${errorMessage}`);
        }
    }

    addTrain() {
        if (!this.currentLayout || this.currentLayout.exits.length === 0) {
            console.warn("No layout loaded or no exits available. Please load a layout first.");
            return;
        }

        const exitSelect = document.getElementById('exitSelect') as HTMLSelectElement;
        if (!exitSelect || !exitSelect.value) {
            console.error("No exit point selected");
            return;
        }

        const exitPointId = exitSelect.value;
        
        // Create a new train with a unique identifier
        const trainNumber = `T${this.trains.length + 1}`;
        const train = new Train(trainNumber, 1); // Create train without position - will be set by TrainManager

        // Use TrainManager to add the train at the selected exit point
        this.trainManager.spawnTrainAtExitPoint(train, exitPointId);
        
        this.trains.push(train);
        console.log(`Added train ${trainNumber} at exit point ${exitPointId}`);

        // Auto-start simulation if this is the first train and simulation is not running
        if (this.trains.length === 1 && !this.trainManager.isSimulationRunning()) {
            this.trainManager.startSimulation();
            console.log("Auto-started simulation for first train");
        }
    }

    clearTrains() {
        this.trainManager.clearAllTrains();
        this.trains = [];
        this.renderer?.renderTrains([]); // Update renderer to clear trains from display
        console.log("All trains cleared");
    }

    startSimulation() {
        this.trainManager.startSimulation();
        console.log("Simulation started from playground");
    }

    stopSimulation() {
        this.trainManager.stopSimulation();
        console.log("Simulation stopped from playground");
    }

    



    updateExitSelect() {
        const exitSelect = document.getElementById('exitSelect') as HTMLSelectElement;
        if (!exitSelect) return;
        
        exitSelect.innerHTML = '';
        
        if (this.currentLayout && this.currentLayout.exits.length > 0) {
            this.currentLayout.exits.forEach((exit: any) => {
                const option = document.createElement('option');
                option.value = exit.id.toString();
                option.textContent = `${exit.destination} (${exit.id})`;
                exitSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No exits available';
            option.disabled = true;
            exitSelect.appendChild(option);
        }
    }



    toggleResultsPanel() {
        if (!this.testResultsPanel) return;
        
        this.testResultsPanel.classList.toggle('minimized');
        const btn = document.getElementById('minimizeResultsBtn');
        if (btn) {
            if (this.testResultsPanel.classList.contains('minimized')) {
                btn.innerHTML = '<i class="bi bi-plus"></i>';
            } else {
                btn.innerHTML = '<i class="bi bi-dash"></i>';
            }
        }
    }

    


}

// Initialize playground when page loads
window.addEventListener("load", () => {
    new PlaygroundApplication();
}); 