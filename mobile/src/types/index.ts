// 消息类型
export type MessageType = 'user' | 'assistant' | 'system' | 'error';

// 消息接口
export interface Message {
  id: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  projectId?: string;
}

// WebSocket 消息类型
export type WSMessageType =
  | 'connected'
  | 'ready'
  | 'projects'
  | 'projectChanged'
  | 'messageAck'
  | 'response'
  | 'error'
  | 'ping'
  | 'pong';

// WebSocket 消息接口
export interface WSMessage {
  type: WSMessageType;
  message?: string;
  content?: string;
  id?: string;
  messageId?: string;
  projectPath?: string;
  projects?: string[];
}

// 项目配置接口
export interface ProjectConfig {
  name: string;
  path: string;
}

// 应用设置接口
export interface AppSettings {
  serverUrl: string;
  enableTTS: boolean;
  currentProjectPath: string;
  projects: ProjectConfig[];
}

// 连接状态
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
