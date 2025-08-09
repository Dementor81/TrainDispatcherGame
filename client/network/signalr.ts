import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import Train from '../sim/train';
import { EventManager } from '../manager/event_manager';

export class SignalRManager {
    private connection: HubConnection | null = null;
    private isConnected = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 2000; // 2 seconds
    private eventManager: EventManager;
    private lastPlayerId: string | null = null;
    private lastStationId: string | null = null;

    constructor(eventManager: EventManager) {
        this.eventManager = eventManager;
        this.initializeConnection();
    }

    private initializeConnection(): void {
        this.connection = new HubConnectionBuilder()
            .withUrl('http://localhost:5070/gamehub', { withCredentials: false })
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]) // Reconnect intervals
            .configureLogging(LogLevel.Information)
            .build();

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        if (!this.connection) return;

        // Connection events
        this.connection.onreconnecting((error) => {
            console.log('SignalR: Attempting to reconnect...', error);
            this.isConnected = false;
            this.notifyConnectionStatusChange(false, true);
        });

        this.connection.onreconnected((connectionId) => {
            console.log('SignalR: Reconnected with connection ID:', connectionId);
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.notifyConnectionStatusChange(true, false);
            
            // Try to rejoin the station if we were previously connected
            this.tryRejoinStation();
        });

        this.connection.onclose((error) => {
            console.log('SignalR: Connection closed', error);
            this.isConnected = false;
            this.notifyConnectionStatusChange(false, false);
        });

        // Game-specific events
        this.connection.on('StationJoined', (data) => {
            console.log('Station joined:', data);
            this.handleStationJoined(data);
        });

        this.connection.on('StationLeft', (data) => {
            console.log('Station left:', data);
            this.handleStationLeft(data);
        });

        this.connection.on('StationStatus', (data) => {
            console.log('Station status:', data);
            this.handleStationStatus(data);
        });

        this.connection.on('TrainArriving', (data) => {
            console.log('Train arriving:', data);
            this.handleTrainArriving(data);
        });

        this.connection.on('TrainDeparting', (data) => {
            console.log('Train departing:', data);
            this.handleTrainDeparting(data);
        });

        this.connection.on('Pong', (timestamp) => {
            console.log('Pong received at:', timestamp);
        });

        this.connection.on('TrainSent', (data) => {
            console.log('Train sent:', data);
            this.handleTrainSent(data);
        });

        this.connection.on('SimulationStateChanged', (data) => {
            console.log('Simulation state changed:', data);
            this.handleSimulationStateChanged(data);
        });


    }

    public async connect(): Promise<void> {
        if (!this.connection) {
            this.initializeConnection();
        }

        try {
            await this.connection?.start();
            this.isConnected = true;
            console.log('SignalR: Connected successfully');
            this.notifyConnectionStatusChange(true, false);
        } catch (error) {
            console.error('SignalR: Failed to connect', error);
            this.isConnected = false;
            this.notifyConnectionStatusChange(false, false);
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.connection) {
            await this.connection.stop();
            this.isConnected = false;
            console.log('SignalR: Disconnected');
        }
    }

    public async joinStation(playerId: string, stationId: string, playerName?: string): Promise<void> {
        if (!this.connection || !this.isConnected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('JoinStation', playerId, stationId, playerName ?? '');
            
            // Store the player and station IDs for reconnection
            this.lastPlayerId = playerId;
            this.lastStationId = stationId;
        } catch (error) {
            console.error('Failed to join station:', error);
            throw error;
        }
    }

    public async leaveStation(playerId: string): Promise<void> {
        if (!this.connection || !this.isConnected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('LeaveStation', playerId);
            
            // Clear stored IDs when leaving station
            this.lastPlayerId = null;
            this.lastStationId = null;
        } catch (error) {
            console.error('Failed to leave station:', error);
            throw error;
        }
    }

    public async getStationStatus(stationId: string): Promise<void> {
        if (!this.connection || !this.isConnected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('GetStationStatus', stationId);
        } catch (error) {
            console.error('Failed to get station status:', error);
            throw error;
        }
    }

    public async ping(): Promise<void> {
        if (!this.connection || !this.isConnected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('Ping');
        } catch (error) {
            console.error('Failed to ping:', error);
            throw error;
        }
    }

    public async sendTrain(playerId: string, trainNumber: string, destinationStationId: string): Promise<void> {
        if (!this.connection || !this.isConnected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReceiveTrain', playerId, trainNumber, destinationStationId);
        } catch (error) {
            console.error('Failed to send train:', error);
            throw error;
        }
    }

    public async reportTrainStopped(playerId: string, trainNumber: string, stationId: string): Promise<void> {
        if (!this.connection || !this.isConnected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReportTrainStopped', playerId, trainNumber, stationId);
            console.log(`Reported train ${trainNumber} stopped at station ${stationId}`);
        } catch (error) {
            console.error('Failed to report train stopped:', error);
            throw error;
        }
    }

    public async reportTrainDeparted(playerId: string, trainNumber: string, stationId: string): Promise<void> {

        if (!this.connection || !this.isConnected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReportTrainDeparted', playerId, trainNumber, stationId);
            console.log(`Reported train ${trainNumber} departed from station ${stationId}`);
        } catch (error) {
            console.error('Failed to report train departed:', error);
            throw error;
        }
    }

    private async tryRejoinStation(): Promise<void> {
        if (this.lastPlayerId && this.lastStationId) {
            console.log(`SignalR: Attempting to rejoin station ${this.lastStationId} as player ${this.lastPlayerId}`);
            try {
                await this.joinStation(this.lastPlayerId, this.lastStationId);
                console.log('SignalR: Successfully rejoined station after reconnection');
            } catch (error) {
                console.error('SignalR: Failed to rejoin station after reconnection:', error);
            }
        }
    }

    // Event handlers - these can be overridden or extended
    private handleStationJoined(data: any): void {
        // Override this method to handle station joined events
        console.log('Station joined event:', data);
    }

    private handleStationLeft(data: any): void {
        // Override this method to handle station left events
        console.log('Station left event:', data);
    }

    private handleStationStatus(data: any): void {
        // Override this method to handle station status events
        console.log('Station status event:', data);
    }

    private handleTrainArriving(data: any): void {
        // Override this method to handle train arriving events
        console.log('Train arriving event:', data);
    }

    private handleTrainDeparting(data: any): void {
        // Override this method to handle train departing events
        console.log('Train departing event:', data);
    }

    private handleTrainSent(data: any): void {
        // Handle train sent event (train is ready for player control)
        console.log(`Train ${data.trainNumber} is ready for control at station ${data.stationId}, exit point ${data.exitPointId}, should stop: ${data.shouldStopAtStation}`);
        
        // Create a new Train instance from the server data
        const train = Train.fromServerData(data);
              
        
        console.log(`Created train: ${train.getInfo()}`)     
        
        // Emit the train created event through the EventManager
        this.eventManager.emit('trainCreated', train, data.exitPointId);
        console.log(`Emitted trainCreated event for train ${train.number}`);
    }

    private handleSimulationStateChanged(data: any): void {
        // Handle simulation state change event from server
        console.log(`Simulation state changed to: ${data.state} at ${data.timestamp}`);
        
        // Emit the simulation state change event through the EventManager
        this.eventManager.emit('simulationStateChanged', data.state, data.timestamp);
        console.log(`Emitted simulationStateChanged event for state: ${data.state}`);
    }



    public get connectionState(): string {
        return this.connection?.state || 'Disconnected';
    }

    public get connected(): boolean {
        return this.isConnected;
    }

    public get lastStationInfo(): { playerId: string | null, stationId: string | null } {
        return {
            playerId: this.lastPlayerId,
            stationId: this.lastStationId
        };
    }

    private notifyConnectionStatusChange(isConnected: boolean, isReconnecting: boolean): void {
        // Emit an event that the Application can listen to
        this.eventManager.emit('connectionStatusChanged', isConnected, isReconnecting);
    }


}

export default SignalRManager;
