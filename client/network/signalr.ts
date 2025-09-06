import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import Train from '../sim/train';
import { EventManager } from '../manager/event_manager';
import { SimulationState } from './dto';

export class SignalRManager {
    private connection: HubConnection | null = null;
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
            this.notifyConnectionStatusChange();
        });

        this.connection.onreconnected((connectionId) => {
            console.log('SignalR: Reconnected with connection ID:', connectionId);
            this.notifyConnectionStatusChange();
            
            // Try to rejoin the station if we were previously connected
            this.tryRejoinStation();
        });

        this.connection.onclose((error) => {
            console.log('SignalR: Connection closed', error);
            this.notifyConnectionStatusChange();
            // When automatic reconnect gives up, onclose fires. Notify app to reset.
            try {
                this.eventManager.emit('permanentlyDisconnected');
            } catch (e) {
                console.error('Failed to emit permanentlyDisconnected event', e);
            }
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

        // No server broadcast handling for collisions; client handles own removal/UI


        this.connection.on('ApprovalRequested', (data) => {
            console.log('Approval requested:', data);
            this.eventManager.emit('approvalRequested', data);
        });

    }

    public async connect(): Promise<void> {
        if (!this.connection) {
            this.initializeConnection();
        }

        try {
            await this.connection?.start();
            console.log('SignalR: Connected successfully');
            this.notifyConnectionStatusChange();
        } catch (error) {
            console.error('SignalR: Failed to connect', error);
            this.notifyConnectionStatusChange();
            throw error;
        }
    }

    public async disconnect(): Promise<void> {
        if (this.connection) {
            await this.connection.stop();
            console.log('SignalR: Disconnected');
        }
    }

    public async joinStation(playerId: string, stationId: string, playerName?: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
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
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
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
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
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
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('Ping');
        } catch (error) {
            console.error('Failed to ping:', error);
            throw error;
        }
    }

    //send train to server
    public async sendTrain(playerId: string, trainNumber: string, exitId: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReceiveTrain', playerId, trainNumber, exitId.toString());
        } catch (error) {
            console.error('Failed to send train:', error);
            throw error;
        }
    }

    public async reportTrainStopped(playerId: string, trainNumber: string, stationId: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
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

        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
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

    public async reportTrainCollision(playerId: string, trainNumberA: string, trainNumberB: string, stationId: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReportTrainCollision', playerId, trainNumberA, trainNumberB, stationId);
            console.log(`Reported collision between trains ${trainNumberA} and ${trainNumberB} at station ${stationId}`);
        } catch (error) {
            console.error('Failed to report train collision:', error);
            throw error;
        }
    }

    public async respondApproval(playerId: string, trainNumber: string, fromStationId: string, approved: boolean): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('RespondApproval', playerId, trainNumber, fromStationId, approved);
        } catch (error) {
            console.error('Failed to respond to approval:', error);
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
        // Convert data.state to SimulationState type
        const state: SimulationState = data.state as SimulationState;
        // Emit the simulation state change event through the EventManager
        this.eventManager.emit('simulationStateChanged', state);
        if (typeof data.speed === 'number') {
            this.eventManager.emit('simulationSpeedChanged', data.speed);
        }
        console.log(`Emitted simulationStateChanged event for state: ${data.state}`);
    }

    // No server collision handler needed



    public get connectionState(): string {
        if (!this.connection) {
            return 'Disconnected';
        }
        return HubConnectionState[this.connection.state];
    }

    public get connected(): boolean {
        return this.connection?.state === HubConnectionState.Connected;
    }

    public get lastStationInfo(): { playerId: string | null, stationId: string | null } {
        return {
            playerId: this.lastPlayerId,
            stationId: this.lastStationId
        };
    }

    private notifyConnectionStatusChange(): void {
        // Emit an event with the current HubConnection state as a string
        const state = this.connectionState;
        this.eventManager.emit('connectionStatusChanged', state);
    }


}

export default SignalRManager;
