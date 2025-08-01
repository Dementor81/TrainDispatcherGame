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

    constructor(eventManager: EventManager) {
        this.eventManager = eventManager;
        this.initializeConnection();
    }

    private initializeConnection(): void {
        this.connection = new HubConnectionBuilder()
            .withUrl('http://localhost:5070/gamehub')
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
        });

        this.connection.onreconnected((connectionId) => {
            console.log('SignalR: Reconnected with connection ID:', connectionId);
            this.isConnected = true;
            this.reconnectAttempts = 0;
        });

        this.connection.onclose((error) => {
            console.log('SignalR: Connection closed', error);
            this.isConnected = false;
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


    }

    public async connect(): Promise<void> {
        if (!this.connection) {
            this.initializeConnection();
        }

        try {
            await this.connection?.start();
            this.isConnected = true;
            console.log('SignalR: Connected successfully');
        } catch (error) {
            console.error('SignalR: Failed to connect', error);
            this.isConnected = false;
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

    public async joinStation(playerId: string, stationId: string): Promise<void> {
        if (!this.connection || !this.isConnected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('JoinStation', playerId, stationId);
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
        console.log(`Train ${data.trainNumber} is ready for control at station ${data.stationId}, exit point ${data.exitPointId}`);
        
        // Create a new Train instance from the server data
        const train = Train.fromServerData(data);
        console.log(`Created train: ${train.getInfo()}`)     
        
        // Emit the train created event through the EventManager
        this.eventManager.emit('trainCreated', train,data.exitPointId);
        console.log(`Emitted trainCreated event for train ${train.number}`);
    }



    public get connectionState(): string {
        return this.connection?.state || 'Disconnected';
    }

    public get connected(): boolean {
        return this.isConnected;
    }


}

export default SignalRManager;
