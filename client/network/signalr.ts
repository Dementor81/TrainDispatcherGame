import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import Train from '../sim/train';
import Switch from '../sim/switch';
import { EventManager } from '../manager/event_manager';
import { SimulationState } from './dto';

export class SignalRManager {
    private connection: HubConnection | null = null;
    private eventManager: EventManager;
    private playerId: string | null = null;
    private stationId: string | null = null;

    constructor(eventManager: EventManager) {
        this.eventManager = eventManager;
        this.initializeConnection();
    }

    private initializeConnection(): void {
        this.connection = new HubConnectionBuilder()
            .withUrl('/gamehub', { withCredentials: false })
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]) // Reconnect intervals
            .configureLogging(LogLevel.Information)
            .build();

        this.setupRemoteEventHandlers();
        this.setupLocalEventHandlers();
    }

    private setupLocalEventHandlers(): void {
        this.eventManager.on("trainStoppedAtStation", (train: Train) => {
            if (this.playerId && this.stationId) {
                this.reportTrainStopped(this.playerId, train.number, this.stationId);
            }
        });

        this.eventManager.on("trainDepartedFromStation", (train: Train) => {
            if (this.playerId && this.stationId) {
                this.reportTrainDeparted(this.playerId, train.number, this.stationId);
            }
        });

        this.eventManager.on("trainCollision", (trainA: Train, trainB: Train) => {
            if (this.playerId && this.stationId) {
                this.reportTrainCollision(this.playerId, trainA.number, trainB.number, this.stationId);
            }
        });

        this.eventManager.on("trainDerailed", (train: Train, sw?: Switch) => {
            if (this.playerId && this.stationId) {
                this.reportTrainDerailed(this.playerId, train.number, this.stationId, sw?.id);
            }
        });
    }

    private setupRemoteEventHandlers(): void {
        if (!this.connection) throw new Error('SignalR connection not established');

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
            this.handleSimulationStateChanged(data);
        });

        this.connection.on('ApprovalRequested', (data) => {
            console.log('Approval requested:', data);
            this.eventManager.emit('approvalRequested', data);
        });

        this.connection.on('ExitBlockStatusChanged', (data) => {
            console.log('Exit block status changed:', data);
            this.handleExitBlockStatusChanged(data);
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
            this.playerId = playerId;
            this.stationId = stationId;
        } catch (error) {
            console.error('Failed to join station:', error);
            throw error;
        }
    }

    public async leaveStation(): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('LeaveStation', this.playerId!);
            
            // Clear stored IDs when leaving station
            this.playerId = null;
            this.stationId = null;
        } catch (error) {
            console.error('Failed to leave station:', error);
            throw error;
        }
    }

    public async getStationStatus(): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('GetStationStatus', this.stationId!);
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
    public async sendTrain(trainNumber: string, exitId: number): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReceiveTrain', this.playerId!, trainNumber, exitId);
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

    public async reportTrainDerailed(playerId: string, trainNumber: string, stationId: string, switchId?: number): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReportTrainDerailed', playerId, trainNumber, stationId, switchId ?? null);
            console.log(`Reported derailment of train ${trainNumber} at station ${stationId}${switchId !== undefined ? ` (switch ${switchId})` : ''}`);
        } catch (error) {
            console.error('Failed to report train derailment:', error);
            throw error;
        }
    }

    public async reportTrainRemoved(playerId: string, trainNumber: string, stationId: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('TrainRemoved', playerId, trainNumber, stationId);
            console.log(`Reported train ${trainNumber} removed at station ${stationId}`);
        } catch (error) {
            console.error('Failed to report train removed:', error);
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

    public async setExitBlockStatus(exitId: number, blocked: boolean): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('SetExitBlockStatus', this.playerId!, exitId, blocked);
            console.log(`Requested to ${blocked ? 'block' : 'unblock'} exit ${exitId}`);
        } catch (error) {
            console.error('Failed to set exit block status:', error);
            throw error;
        }
    }

    private async tryRejoinStation(): Promise<void> {
        if (this.playerId && this.stationId) {
            console.log(`SignalR: Attempting to rejoin station ${this.stationId} as player ${this.playerId}`);
            try {
                await this.joinStation(this.playerId, this.stationId);
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
        console.log(`Train ${data.trainNumber} recieved from server, exit point ${data.exitPointId}, action: ${data.action}`);
        // Create a new Train instance from the server data
        const train = Train.fromServerData(data);             
        
        // Emit the train created event through the EventManager
        this.eventManager.emit('trainCreated', train, data.exitPointId);
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
    }

    private handleExitBlockStatusChanged(data: any): void {        
        this.eventManager.emit('exitBlockStatusChanged', data.exitId, data.blocked);
    }

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
            playerId: this.playerId,
            stationId: this.stationId
        };
    }

    private notifyConnectionStatusChange(): void {
        this.eventManager.emit('connectionStatusChanged', this.connectionState);
    }


}

export default SignalRManager;
