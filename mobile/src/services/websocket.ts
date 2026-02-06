import { WSMessage, ConnectionStatus } from '../types';

type MessageCallback = (message: WSMessage) => void;
type StatusCallback = (status: ConnectionStatus) => void;

// WebSocket 常量
const READY_STATES = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

/**
 * Claude WebSocket Service
 * 适配新的Server消息路由架构
 */
export class ClaudeWebSocketService {
  private ws: any = null;
  private serverUrl: string;
  private messageCallbacks: Set<MessageCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private currentStatus: ConnectionStatus = 'disconnected';
  private projectPath: string = '';

  // 新增：设备和会话管理
  private deviceId: string;
  private sessionId: string | null = null;
  private isRegistered: boolean = false;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
    // 生成唯一设备ID（持久化存储可后续优化）
    this.deviceId = this.generateDeviceId();
  }

  // 生成设备ID
  private generateDeviceId(): string {
    // TODO: 从AsyncStorage读取持久化的deviceId
    return `mobile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // 生成会话ID
  private generateSessionId(): string {
    const buffer = new Uint8Array(16);
    // React Native环境下的随机数生成
    for (let i = 0; i < 16; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // 连接到服务器
  connect(projectPath: string = ''): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.projectPath = projectPath;
        this.updateStatus('connecting');

        // 构建 WebSocket URL
        const wsUrl = this.serverUrl.replace('http', 'ws') + '/ws';
        console.log('正在连接到:', wsUrl);
        this.ws = new (global as any).WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket 连接成功');
          this.reconnectAttempts = 0;

          // Step 1: 注册为mobile设备
          this.registerDevice();

          resolve();
        };

        this.ws.onmessage = (event: any) => {
          try {
            const message: WSMessage = JSON.parse(event.data);
            console.log('收到消息:', message);

            // 处理不同类型的消息
            this.handleMessage(message);

            // 通知所有监听器（添加错误保护）
            this.messageCallbacks.forEach(callback => {
              try {
                callback(message);
              } catch (error) {
                console.error('[WebSocket] Callback error:', error);
                // 不中断其他callback的执行
              }
            });
          } catch (error) {
            console.error('解析消息失败:', error);
          }
        };

        this.ws.onerror = (error: any) => {
          console.error('WebSocket 错误:', error);
          this.updateStatus('error');
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket 连接关闭');
          this.isRegistered = false;
          this.sessionId = null;
          this.updateStatus('disconnected');

          // 尝试重新连接
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => {
              this.connect(this.projectPath).catch(console.error);
            }, this.reconnectDelay);
          }
        };
      } catch (error) {
        this.updateStatus('error');
        reject(error);
      }
    });
  }

  // 注册设备
  private registerDevice(): void {
    console.log('注册mobile设备:', this.deviceId);
    this.send({
      type: 'register',
      deviceId: this.deviceId,
      deviceType: 'mobile'
    });
  }

  // 初始化会话
  private initializeSession(): void {
    if (!this.sessionId) {
      this.sessionId = this.generateSessionId();
    }

    console.log('初始化会话:', this.sessionId);
    this.send({
      type: 'init',
      sessionId: this.sessionId
    });
  }

  // 处理服务器消息
  private handleMessage(message: WSMessage): void {
    switch (message.type) {
      case 'registered':
        console.log('✅ 设备注册成功');
        this.isRegistered = true;
        this.updateStatus('connected');

        // Step 2: 初始化会话
        this.initializeSession();
        break;

      case 'ready':
        console.log('✅ 会话已就绪');
        // 会话准备完成，可以开始发送消息
        break;

      case 'messageAck':
        console.log('✅ 消息已送达');
        break;

      case 'responseChunk':
        // Claude的响应chunk，交给UI层处理
        break;

      case 'permissionRequest':
        // 权限请求，自动批准或提示用户
        this.handlePermissionRequest(message);
        break;

      case 'error':
        console.error('服务器错误:', message.message);
        break;

      default:
        console.log('未处理的消息类型:', message.type);
    }
  }

  // 处理权限请求
  private handlePermissionRequest(message: WSMessage): void {
    console.log('🔐 收到权限请求:', message);

    // TODO: 可以弹出UI让用户确认，这里暂时自动批准
    const shouldApprove = true; // 可配置为询问用户

    this.send({
      type: 'permission-response',
      sessionId: this.sessionId,
      requestId: message.id,
      approved: shouldApprove,
      reason: shouldApprove ? 'Auto approved by mobile app' : 'User denied'
    });
  }

  // 断开连接
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.isRegistered = false;
    this.sessionId = null;
    this.updateStatus('disconnected');
  }

  // 发送消息（底层）
  private send(message: any): void {
    if (this.ws && this.ws.readyState === READY_STATES.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket 未连接');
    }
  }

  // 发送用户消息
  sendMessage(content: string, messageId: string): void {
    console.log('[WebSocket] sendMessage called, isRegistered:', this.isRegistered, 'sessionId:', this.sessionId);

    if (!this.isRegistered || !this.sessionId) {
      console.error('设备未注册或会话未初始化, isRegistered:', this.isRegistered, 'sessionId:', this.sessionId);
      return;
    }

    console.log('[WebSocket] Sending message to server:', {
      type: 'message',
      sessionId: this.sessionId,
      content: content.substring(0, 50) + '...'
    });

    this.send({
      type: 'message',
      id: messageId,
      sessionId: this.sessionId,
      content,
      projectPath: this.projectPath || '/tmp/mobile-project'
    });
  }

  // 切换项目
  changeProject(projectPath: string, targetDeviceId?: string): void {
    this.projectPath = projectPath;

    console.log('切换项目到:', projectPath, 'targetDeviceId:', targetDeviceId);

    // 发送changeProject消息到Server
    this.send({
      type: 'changeProject',
      sessionId: this.sessionId,
      projectPath: projectPath,
      targetDeviceId: targetDeviceId // 指定目标设备
    });
  }

  // 加载更多历史消息
  loadMoreHistory(offset: number, limit: number = 20): void {
    if (!this.sessionId) {
      console.error('[WebSocket] Cannot load more history: no session');
      return;
    }

    console.log(`[WebSocket] Loading more history: offset=${offset}, limit=${limit}`);
    this.send({
      type: 'loadMoreHistory',
      sessionId: this.sessionId,
      offset,
      limit
    });
  }

  // 发送确认响应
  sendConfirmResponse(response: string): void {
    // TODO: 适配新的permission-response格式
    this.send({
      type: 'confirmResponse',
      response
    });
  }

  // 注册消息监听器
  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  // 注册状态监听器
  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    callback(this.currentStatus);
    return () => this.statusCallbacks.delete(callback);
  }

  // 更新状态
  private updateStatus(status: ConnectionStatus): void {
    this.currentStatus = status;
    this.statusCallbacks.forEach(callback => callback(status));
  }

  // 获取当前状态
  getStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  // 获取会话ID
  getSessionId(): string | null {
    return this.sessionId;
  }

  // 获取设备ID
  getDeviceId(): string {
    return this.deviceId;
  }

  // 更新服务器 URL
  updateServerUrl(url: string): void {
    if (this.serverUrl !== url) {
      const wasConnected = this.getStatus() === 'connected';
      this.serverUrl = url;

      // 如果之前已连接，使用新URL重新连接
      if (wasConnected) {
        console.log('服务器URL已更改，重新连接...');
        this.disconnect();
        setTimeout(() => {
          this.connect(this.projectPath).catch(console.error);
        }, 500);
      }
    }
  }

  // 清理资源
  dispose(): void {
    this.disconnect();
    this.messageCallbacks.clear();
    this.statusCallbacks.clear();
  }
}

// 单例实例
let serviceInstance: ClaudeWebSocketService | null = null;

export function getWebSocketService(serverUrl: string): ClaudeWebSocketService {
  if (!serviceInstance) {
    serviceInstance = new ClaudeWebSocketService(serverUrl);
  } else {
    // 如果 serverUrl 变了，更新服务实例
    serviceInstance.updateServerUrl(serverUrl);
  }
  return serviceInstance;
}
