/**
 * WebSocket Client
 * Handles connection to server and message routing
 */

import WebSocket from 'ws';
import type {
  WSMessage,
  RegisterMessage,
  UserMessageFromServer,
  PermissionResponseFromServer,
  OutputChunkMessage,
  PermissionRequestMessage
} from './types.js';

export class WSClient {
  private ws: WebSocket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private messageHandlers = new Map<string, (data: any) => void>();
  private isConnected = false;

  constructor(
    private serverUrl: string,
    private deviceId: string,
    private publicKey?: string
  ) {}

  /**
   * Connect to server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔌 Connecting to server: ${this.serverUrl}`);

      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        console.log('✅ Connected to server');
        this.isConnected = true;

        // Register as desktop client
        this.register();

        // Start heartbeat
        this.startHeartbeat();

        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          this.handleMessage(message);
        } catch (e) {
          console.error('❌ Failed to parse server message:', e);
          console.error('   Data:', data.toString());
        }
      });

      this.ws.on('close', (code, reason) => {
        console.log(`❌ Disconnected from server: ${code} ${reason.toString()}`);
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        if (!this.isConnected) {
          reject(error);
        }
      });
    });
  }

  /**
   * Register with server
   */
  private register(): void {
    const message: RegisterMessage = {
      type: 'register',
      deviceId: this.deviceId,
      deviceType: 'desktop',
      publicKey: this.publicKey
    };

    this.send(message);
  }

  /**
   * Start heartbeat ping
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'ping' });
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectInterval) return;

    console.log('🔄 Scheduling reconnection in 5 seconds...');

    this.reconnectInterval = setInterval(async () => {
      console.log('🔄 Attempting to reconnect...');
      try {
        await this.connect();
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
      } catch (e) {
        console.error('❌ Reconnection failed:', e);
      }
    }, 5000);
  }

  /**
   * Register message handler
   */
  on(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * Handle incoming message from server
   */
  private handleMessage(message: WSMessage): void {
    const handler = this.messageHandlers.get(message.type);

    if (handler) {
      handler(message.data || message);
    } else if (message.type === 'pong') {
      // Heartbeat response
    } else if (message.type === 'registered') {
      console.log('✅ Device registered:', message);
    } else {
      console.log(`⚠️  Unhandled server message: ${message.type}`);
    }
  }

  /**
   * Send message to server
   */
  send(message: WSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket not connected, cannot send message');
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (e) {
      console.error('❌ Failed to send message:', e);
    }
  }

  /**
   * Send output chunk to server
   */
  sendOutputChunk(sessionId: string, content: string, encrypted: boolean = false): void {
    const message: OutputChunkMessage = {
      type: 'output-chunk',
      sessionId,
      data: {
        content,
        encrypted
      }
    };

    this.send(message);
  }

  /**
   * Send permission request to server
   */
  sendPermissionRequest(
    sessionId: string,
    requestId: string,
    toolName: string,
    input: unknown
  ): void {
    const message: PermissionRequestMessage = {
      type: 'permission-request',
      sessionId,
      data: {
        requestId,
        toolName,
        input
      }
    };

    this.send(message);
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    console.log('👋 Disconnecting from server...');

    this.stopHeartbeat();

    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
