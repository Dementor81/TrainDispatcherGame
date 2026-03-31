import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import Train from '../sim/train';
import Switch from '../sim/switch';
import { EventManager } from '../manager/event_manager';
import { SimulationState, TrainDelayUpdatedNotificationDto, TrainRemovedNotificationDto } from './dto';

export class JoinRejectedError extends Error {
    public readonly reason: string;

    constructor(reason: string, message: string) {
        super(message);
        this.name = 'JoinRejectedError';
        this.reason = reason;
    }
}

export class SignalRManager {
    private connection: HubConnection | null = null;
    private eventManager: EventManager;
    private playerId: string | null = null;
    private stationId: string | null = null;
    private gameCode: string | null = null;
    private playerName: string | null = null;

    constructor(eventManager: EventManager) {
        this.eventManager = eventManager;
        this.initializeConnection();
    }

    private initializeConnection(): void {
        this.connection = new HubConnectionBuilder()
            .withUrl('/gamehub', { withCredentials: false })
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(LogLevel.Information)
            .build();

        // Match server ClientTimeoutInterval (20s) so both sides agree on when a
        // connection is dead. Combined with the 30s server grace period this ensures
        // the client reconnects before the grace period expires.
        this.connection.serverTimeoutInMilliseconds = 20000;
        this.connection.keepAliveIntervalInMilliseconds = 10000;

        this.setupRemoteEventHandlers();
        this.setupLocalEventHandlers();
    }

    private setupLocalEventHandlers(): void {
        this.eventManager.on("trainStoppedAtStation", (train: Train) => {
            if (this.stationId) {
                this.reportTrainStopped(train.number, this.stationId);
            }
        });

        this.eventManager.on("trainDepartedFromStation", (train: Train) => {
            if (this.stationId) {
                this.reportTrainDeparted(train.number, this.stationId);
            }
        });

        this.eventManager.on("trainCollision", (trainA: Train, trainB: Train) => {
            if (this.stationId) {
                this.reportTrainCollision(trainA.number, trainB.number, this.stationId);
            }
        });

        this.eventManager.on("trainDerailed", (train: Train, sw?: Switch) => {
            if (this.stationId) {
                this.reportTrainDerailed(train.number, this.stationId, sw?.id);
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
            
            // Restore station/session context after reconnect
            this.tryRestoreSessionContext();
        });

        this.connection.onclose((error) => {
            console.log('SignalR: Connection closed', error);
            this.notifyConnectionStatusChange();
            // All automatic reconnect attempts exhausted while a station was active.
            if (this.stationId) {
                this.eventManager.emit('connectionPermanentlyLost');
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

        this.connection.on('SessionJoined', (data) => {
            console.log('Session joined:', data);
        });

        this.connection.on('PlayerJoinedStation', (data) => {
            console.log('Player joined station:', data);
            this.eventManager.emit('playerStationChanged', data);
        });

        this.connection.on('PlayerLeftStation', (data) => {
            console.log('Player left station:', data);
            this.eventManager.emit('playerStationChanged', data);
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

        this.connection.on('TrainDelayUpdated', (data) => {
            this.handleTrainDelayUpdated(data);
        });

        this.connection.on('TrainRemoved', (data) => {
            this.handleTrainRemoved(data);
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

    public async join(gameCode: string, playerId: string, playerName?: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            const result = await this.connection.invoke('Join', playerId, gameCode, playerName ?? '') as {
                success?: boolean;
                errorCode?: string;
                message?: string;
            } | null;

            if (!result?.success) {
                const reason = result?.errorCode ?? 'join_failed';
                const message = result?.message ?? 'Failed to join game session.';
                throw new JoinRejectedError(reason, message);
            }

            this.gameCode = gameCode;
            this.playerId = playerId;
            if (playerName) this.playerName = playerName;
        } catch (error) {
            console.error('Failed to join game session:', error);
            throw error;
        }
    }

    public async joinStation(stationId: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('JoinStation', stationId);
            this.stationId = stationId;
        } catch (error) {
            console.error('Failed to join station:', error);
            throw error;
        }
    }

    public async joinSession(gameCode: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('JoinSession', gameCode);
            this.gameCode = gameCode;
        } catch (error) {
            console.error('Failed to join session:', error);
            throw error;
        }
    }

    public async leaveStation(): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('LeaveStation');
            
            // Keep player identity/session context; only clear station ownership.
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
            await this.connection.invoke('ReceiveTrain', trainNumber, exitId);
        } catch (error) {
            console.error('Failed to send train:', error);
            throw error;
        }
    }

    public async reportTrainStopped(trainNumber: string, stationId: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReportTrainStopped', trainNumber, stationId);
            console.log(`Reported train ${trainNumber} stopped at station ${stationId}`);
        } catch (error) {
            console.error('Failed to report train stopped:', error);
            throw error;
        }
    }

    public async reportTrainDeparted(trainNumber: string, stationId: string): Promise<void> {

        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReportTrainDeparted', trainNumber, stationId);
            console.log(`Reported train ${trainNumber} departed from station ${stationId}`);
        } catch (error) {
            console.error('Failed to report train departed:', error);
            throw error;
        }
    }

    public async reportTrainCollision(trainNumberA: string, trainNumberB: string, stationId: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReportTrainCollision', trainNumberA, trainNumberB, stationId);
            console.log(`Reported collision between trains ${trainNumberA} and ${trainNumberB} at station ${stationId}`);
        } catch (error) {
            console.error('Failed to report train collision:', error);
            throw error;
        }
    }

    public async reportTrainDerailed(trainNumber: string, stationId: string, switchId?: number): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('ReportTrainDerailed', trainNumber, stationId, switchId ?? null);
            console.log(`Reported derailment of train ${trainNumber} at station ${stationId}${switchId !== undefined ? ` (switch ${switchId})` : ''}`);
        } catch (error) {
            console.error('Failed to report train derailment:', error);
            throw error;
        }
    }

    public async reportTrainRemoved(trainNumber: string, stationId: string): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('TrainRemoved', trainNumber, stationId);
            console.log(`Reported train ${trainNumber} removed at station ${stationId}`);
        } catch (error) {
            console.error('Failed to report train removed:', error);
            throw error;
        }
    }

    public async respondApproval(trainNumber: string, fromStationId: string, approved: boolean): Promise<void> {
        if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
            throw new Error('SignalR connection not established');
        }

        try {
            await this.connection.invoke('RespondApproval', trainNumber, fromStationId, approved);
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
            await this.connection.invoke('SetExitBlockStatus', exitId, blocked);
            console.log(`Requested to ${blocked ? 'block' : 'unblock'} exit ${exitId}`);
        } catch (error) {
            console.error('Failed to set exit block status:', error);
            throw error;
        }
    }

    private async tryRestoreSessionContext(): Promise<void> {
        if (this.playerId && this.gameCode) {
            console.log(`SignalR: Attempting to rejoin game ${this.gameCode} as player ${this.playerId}`);
            try {
                await this.join(this.gameCode, this.playerId, this.playerName ?? undefined);
                if (this.stationId) {
                    await this.joinStation(this.stationId);
                    console.log('SignalR: Successfully rejoined station after reconnection');
                } else {
                    console.log('SignalR: Successfully rejoined game after reconnection');
                }
            } catch (error) {
                console.error('SignalR: Failed to restore game context after reconnection:', error);
            }
            return;
        }

        if (this.gameCode) {
            console.log(`SignalR: Attempting to rejoin session ${this.gameCode}`);
            try {
                await this.joinSession(this.gameCode);
                console.log('SignalR: Successfully rejoined session after reconnection');
            } catch (error) {
                console.error('SignalR: Failed to rejoin session after reconnection:', error);
            }
        }
    }

    // Event handlers - these can be overridden or extended
    private handleStationJoined(data: any): void {
        console.log('Station joined event:', data);
        // On a full rejoin (not a grace-period reconnect), the client's local train
        // state is stale — notify the application so it can clear it.
        if (data.success && !data.isReconnect) {
            this.eventManager.emit('stationJoinedFull');
        }
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
        const train = Train.fromServerData(data, this.eventManager);             
        
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

    private handleTrainDelayUpdated(data: TrainDelayUpdatedNotificationDto): void {
        this.eventManager.emit('trainDelayUpdated', data);
    }

    private handleTrainRemoved(data: TrainRemovedNotificationDto): void {
        this.eventManager.emit('trainRemoved', data);
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
