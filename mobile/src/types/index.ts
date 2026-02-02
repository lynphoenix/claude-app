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
  | 'registered' // 新增：设备注册成功
  | 'ready'
  | 'projects'
  | 'projectChanged'
  | 'messageAck'
  | 'response'
  | 'responseChunk'
  | 'responseDone'
  | 'permissionRequest' // 新增：权限请求
  | 'confirmationPrompt'
  | 'commandPlan'
  | 'commandsExecuting'
  | 'terminalOutput'
  | 'terminalExit'
  | 'historyLoaded'
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
  history?: any[]; // Claude Code session 历史
  hasMoreHistory?: boolean; // 是否有更多历史
  totalMessages?: number; // 总消息数
  offset?: number; // 当前偏移量
  hasMore?: boolean; // 是否还有更多（用于 historyLoaded）
  // PTY相关字段
  commands?: string[]; // 命令列表
  explanation?: string; // 命令说明
  data?: string; // 终端输出数据
  exitCode?: number; // 进程退出代码
  prompt?: string; // 确认提示
  // 新增：权限请求相关字段
  requestId?: string; // 权限请求ID
  toolName?: string; // 工具名称
  input?: any; // 工具输入参数
}

// 项目配置接口
export interface ProjectConfig {
  name: string;
  path: string;
  hasClaudeDir?: boolean;
  deviceId?: string; // 设备ID，用于多设备场景
  deviceName?: string; // 设备显示名称
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
