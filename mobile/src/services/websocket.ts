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

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
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

          // 发送初始化消息（即使没有项目路径也发送，以获取项目列表）
          if (this.ws) {
            const initMessage: any = {
              type: 'init'
            };
            // 只有当 projectPath 非空时才发送
            if (this.projectPath) {
              initMessage.projectPath = this.projectPath;
            }
            this.ws.send(JSON.stringify(initMessage));
          }

          this.updateStatus('connected');
          resolve();
        };

        this.ws.onmessage = (event: any) => {
          try {
            const message: WSMessage = JSON.parse(event.data);
            console.log('收到消息:', message);

            // 处理不同类型的消息
            switch (message.type) {
              case 'ready':
                this.updateStatus('connected');
                break;
              case 'error':
                console.error('服务器错误:', message.message);
                break;
            }

            // 通知所有监听器
            this.messageCallbacks.forEach(callback => callback(message));
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

  // 断开连接
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.updateStatus('disconnected');
  }

  // 发送消息
  send(message: any): void {
    if (this.ws && this.ws.readyState === READY_STATES.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket 未连接');
    }
  }

  // 发送用户消息
  sendMessage(content: string, messageId: string): void {
    this.send({
      type: 'message',
      content,
      id: messageId
    });
  }

  // 切换项目
  changeProject(projectPath: string): void {
    this.projectPath = projectPath;
    this.send({
      type: 'changeProject',
      projectPath
    });
  }

  // 加载更多历史消息
  loadMoreHistory(offset: number, limit: number = 20): void {
    this.send({
      type: 'loadMoreHistory',
      offset,
      limit
    });
  }

  // 发送确认响应
  sendConfirmResponse(response: string): void {
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
  if (!serviceInstance || serviceInstance.getStatus() === 'disconnected') {
    serviceInstance = new ClaudeWebSocketService(serverUrl);
  }
  return serviceInstance;
}
