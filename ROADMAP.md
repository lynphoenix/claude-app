# Claude Code Mobile - 实施路线图

## 目标架构

```
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│   手机 App   │◄───WSS──►│  服务器(219) │◄───WSS──►│ 桌面客户端   │
│             │          │             │          │             │
│ - 输入UI    │          │ - 消息路由  │          │ - 运行Claude│
│ - 显示输出  │          │ - 状态管理  │          │ - ACP协议   │
│ - 权限UI    │          │ - 设备注册  │          │ - 文件操作  │
└─────────────┘          └─────────────┘          └─────────────┘
```

---

## Phase 1: 设备切换 + ACP (核心架构) - Week 1-2

### 目标
实现手机和电脑无缝切换控制 Claude，使用 ACP 标准协议

### 验收标准
- [ ] 桌面客户端能连接到服务器
- [ ] 桌面客户端用 ACP 运行 Claude
- [ ] 手机发消息 → 桌面执行 → 手机显示结果
- [ ] 手机能看到并批准/拒绝权限请求
- [ ] 状态同步：所有设备知道谁在控制
- [ ] 设备切换：手机发消息时自动接管控制权

---

## Phase 2: 端到端加密 - Week 3

### 目标
实现消息加密，服务器无法读取明文

### 验收标准
- [ ] 手机生成密钥对
- [ ] 消息发送前加密
- [ ] 桌面客户端解密消息
- [ ] 输出加密后发回手机
- [ ] 密钥备份（QR码）
- [ ] 服务器只存储密文

---

## Phase 3: 最终对比 - Week 4

### 目标
对比我们的实现与 Happy Coder 的差异

---

# 详细实施计划

## Task 1: 桌面客户端基础 (Day 1-2)

### 1.1 项目搭建

**目录结构：**
```
desktop/
├── src/
│   ├── index.ts           # 主入口
│   ├── claudeManager.ts   # Claude 进程管理 (ACP)
│   ├── wsClient.ts        # WebSocket 客户端
│   ├── types.ts           # 类型定义
│   └── config.ts          # 配置管理
├── package.json
├── tsconfig.json
└── .env.example
```

**依赖安装：**
```bash
cd desktop
npm init -y
npm install ws uuid dotenv
npm install -D @types/node @types/ws @types/uuid typescript tsx
```

### 1.2 核心文件

#### `desktop/src/types.ts`

```typescript
import { ChildProcess } from 'child_process';

// WebSocket 消息类型
export type WSMessage =
  | RegisterMessage
  | UserMessageData
  | PermissionResponseData
  | PingMessage;

export interface RegisterMessage {
  type: 'register';
  deviceId: string;
  deviceType: 'desktop';
  hostname: string;
}

export interface UserMessageData {
  type: 'user-message';
  sessionId: string;
  content: string;
  projectPath: string;
  messageId: string;
}

export interface PermissionResponseData {
  type: 'permission-response';
  sessionId: string;
  requestId: string;
  approved: boolean;
  reason?: string;
}

export interface PingMessage {
  type: 'ping';
}

// 发送给服务器的消息
export type ClientMessage =
  | { type: 'output-chunk'; sessionId: string; content: string; messageId: string }
  | { type: 'permission-request'; sessionId: string; requestId: string; toolName: string; input: any }
  | { type: 'status'; sessionId: string; status: 'idle' | 'running' | 'waiting-permission' }
  | { type: 'session-ready'; sessionId: string }
  | { type: 'pong' };

// ACP 消息类型
export interface ACPMessage {
  type: string;
  [key: string]: any;
}

export interface ACPUserMessage extends ACPMessage {
  type: 'user';
  message: {
    role: 'user';
    content: Array<{ type: 'text'; text: string }>;
  };
}

export interface ACPAssistantMessage extends ACPMessage {
  type: 'assistant';
  message: {
    role: 'assistant';
    content: Array<{
      type: 'text' | 'tool_use';
      text?: string;
      id?: string;
      name?: string;
      input?: any;
    }>;
  };
}

export interface ACPControlRequest extends ACPMessage {
  type: 'control_request';
  subtype: 'can_use_tool';
  request_id: string;
  tool: {
    name: string;
    input: any;
  };
}

export interface ACPControlResponse extends ACPMessage {
  type: 'control_response';
  response: {
    request_id: string;
    outcome: 'approved' | 'denied';
  };
}

// Claude 会话
export interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  process: ChildProcess;
  status: 'idle' | 'running' | 'waiting-permission';
  pendingRequests: Map<string, PermissionRequestInfo>;
}

export interface PermissionRequestInfo {
  requestId: string;
  toolName: string;
  input: any;
  timestamp: number;
  resolve: (approved: boolean) => void;
  timeout?: NodeJS.Timeout;
}
```

#### `desktop/src/config.ts`

```typescript
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';

dotenv.config();

export const config = {
  // 服务器配置
  serverUrl: process.env.SERVER_URL || 'ws://47.99.75.219:3001/ws',

  // 设备信息
  deviceId: `desktop-${os.hostname()}-${Date.now()}`,
  hostname: os.hostname(),

  // Claude 配置
  claudePath: process.env.CLAUDE_PATH || path.join(os.homedir(), '.local/bin/claude'),
  defaultProjectPath: process.env.DEFAULT_PROJECT_PATH || process.cwd(),

  // 超时配置
  permissionTimeout: 60000,  // 60秒
  reconnectInterval: 5000,   // 5秒
  heartbeatInterval: 30000,  // 30秒
};
```

#### `desktop/src/claudeManager.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import {
  ClaudeSession,
  ACPMessage,
  ACPUserMessage,
  ACPAssistantMessage,
  ACPControlRequest,
  ACPControlResponse,
  PermissionRequestInfo
} from './types';
import { config } from './config';

export class ClaudeManager {
  private sessions = new Map<string, ClaudeSession>();

  /**
   * 启动 Claude 会话（使用 ACP 协议）
   */
  async startSession(
    sessionId: string,
    projectPath: string,
    callbacks: {
      onOutput: (sessionId: string, content: string, messageId: string) => void;
      onPermissionRequest: (sessionId: string, requestId: string, toolName: string, input: any) => Promise<boolean>;
      onStatusChange: (sessionId: string, status: 'idle' | 'running' | 'waiting-permission') => void;
      onReady: (sessionId: string) => void;
    }
  ): Promise<void> {
    console.log(`[Claude] 启动会话: ${sessionId}`);
    console.log(`[Claude] 项目路径: ${projectPath}`);
    console.log(`[Claude] Claude 路径: ${config.claudePath}`);

    // 启动 Claude 进程（ACP 模式）
    const args = [
      '--continue',
      '--input-format', 'stream-json',   // 关键：启用 ACP
      '--output-format', 'jsonl',
      '--permission-mode', 'default'
    ];

    const claudeProcess = spawn(config.claudePath, args, {
      cwd: projectPath,
      env: {
        ...process.env,
        PATH: `${process.env.PATH}:${require('path').dirname(config.claudePath)}`,
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 创建会话对象
    const session: ClaudeSession = {
      sessionId,
      projectPath,
      process: claudeProcess,
      status: 'idle',
      pendingRequests: new Map()
    };

    this.sessions.set(sessionId, session);

    // 处理 stdout（JSONL 格式）
    let buffer = '';
    const rl = createInterface({
      input: claudeProcess.stdout,
      crlfDelay: Infinity
    });

    rl.on('line', (line: string) => {
      if (!line.trim()) return;

      try {
        const message: ACPMessage = JSON.parse(line);
        this.handleACPMessage(session, message, callbacks);
      } catch (e) {
        console.error('[Claude] 解析消息失败:', line);
        console.error('[Claude] 错误:', e);
      }
    });

    // 处理 stderr
    claudeProcess.stderr.on('data', (data: Buffer) => {
      console.error('[Claude stderr]', data.toString());
    });

    // 处理进程退出
    claudeProcess.on('exit', (code, signal) => {
      console.log(`[Claude] 进程退出: code=${code}, signal=${signal}`);
      this.sessions.delete(sessionId);

      // 清理所有待处理的权限请求
      for (const [_, request] of session.pendingRequests) {
        if (request.timeout) clearTimeout(request.timeout);
        request.resolve(false);
      }
      session.pendingRequests.clear();
    });

    claudeProcess.on('error', (error) => {
      console.error('[Claude] 进程错误:', error);
    });

    // 通知就绪
    callbacks.onReady(sessionId);
    console.log(`[Claude] 会话就绪: ${sessionId}`);
  }

  /**
   * 处理 ACP 消息
   */
  private handleACPMessage(
    session: ClaudeSession,
    message: ACPMessage,
    callbacks: {
      onOutput: (sessionId: string, content: string, messageId: string) => void;
      onPermissionRequest: (sessionId: string, requestId: string, toolName: string, input: any) => Promise<boolean>;
      onStatusChange: (sessionId: string, status: 'idle' | 'running' | 'waiting-permission') => void;
    }
  ): void {
    switch (message.type) {
      case 'assistant':
        this.handleAssistantMessage(session, message as ACPAssistantMessage, callbacks);
        break;

      case 'control_request':
        this.handleControlRequest(session, message as ACPControlRequest, callbacks);
        break;

      case 'system':
        console.log('[Claude] System:', message);
        break;

      case 'result':
        console.log('[Claude] Result:', message);
        session.status = 'idle';
        callbacks.onStatusChange(session.sessionId, 'idle');
        break;

      case 'log':
        console.log('[Claude Log]', message);
        break;

      default:
        console.log('[Claude] 未处理的消息类型:', message.type);
    }
  }

  /**
   * 处理助手消息（包含文本和工具调用）
   */
  private handleAssistantMessage(
    session: ClaudeSession,
    message: ACPAssistantMessage,
    callbacks: {
      onOutput: (sessionId: string, content: string, messageId: string) => void;
    }
  ): void {
    session.status = 'running';

    for (const block of message.message.content) {
      if (block.type === 'text' && block.text) {
        // 文本输出
        callbacks.onOutput(session.sessionId, block.text, Date.now().toString());
      } else if (block.type === 'tool_use') {
        // 工具调用（会触发 control_request）
        console.log(`[Claude] 工具调用: ${block.name}`);
      }
    }
  }

  /**
   * 处理控制请求（权限请求）
   */
  private async handleControlRequest(
    session: ClaudeSession,
    request: ACPControlRequest,
    callbacks: {
      onPermissionRequest: (sessionId: string, requestId: string, toolName: string, input: any) => Promise<boolean>;
      onStatusChange: (sessionId: string, status: 'idle' | 'running' | 'waiting-permission') => void;
    }
  ): Promise<void> {
    if (request.subtype !== 'can_use_tool') {
      console.warn('[Claude] 未知的控制请求:', request.subtype);
      return;
    }

    const { request_id, tool } = request;
    const { name: toolName, input } = tool;

    console.log(`[Claude] 权限请求: ${toolName}`);
    console.log(`[Claude] 输入:`, JSON.stringify(input, null, 2));

    session.status = 'waiting-permission';
    callbacks.onStatusChange(session.sessionId, 'waiting-permission');

    try {
      // 调用权限回调（会发送到手机）
      const approved = await callbacks.onPermissionRequest(
        session.sessionId,
        request_id,
        toolName,
        input
      );

      // 发送响应给 Claude
      const response: ACPControlResponse = {
        type: 'control_response',
        response: {
          request_id,
          outcome: approved ? 'approved' : 'denied'
        }
      };

      this.writeToProcess(session, response);

      session.status = approved ? 'running' : 'idle';
      callbacks.onStatusChange(session.sessionId, session.status);

    } catch (error) {
      console.error('[Claude] 权限请求处理失败:', error);

      // 发送拒绝响应
      const response: ACPControlResponse = {
        type: 'control_response',
        response: {
          request_id,
          outcome: 'denied'
        }
      };

      this.writeToProcess(session, response);
      session.status = 'idle';
      callbacks.onStatusChange(session.sessionId, 'idle');
    }
  }

  /**
   * 发送消息给 Claude
   */
  sendMessage(sessionId: string, content: string, messageId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[Claude] 会话不存在: ${sessionId}`);
      return;
    }

    const message: ACPUserMessage = {
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text: content }]
      }
    };

    console.log(`[Claude] 发送消息: ${content.substring(0, 100)}...`);
    this.writeToProcess(session, message);
  }

  /**
   * 响应权限请求
   */
  respondToPermission(sessionId: string, requestId: string, approved: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.error(`[Claude] 会话不存在: ${sessionId}`);
      return;
    }

    const response: ACPControlResponse = {
      type: 'control_response',
      response: {
        request_id: requestId,
        outcome: approved ? 'approved' : 'denied'
      }
    };

    console.log(`[Claude] 权限响应: ${requestId} = ${approved ? '批准' : '拒绝'}`);
    this.writeToProcess(session, response);
  }

  /**
   * 写入消息到 Claude 进程
   */
  private writeToProcess(session: ClaudeSession, message: ACPMessage): void {
    if (!session.process.stdin) {
      console.error('[Claude] stdin 不可用');
      return;
    }

    const json = JSON.stringify(message) + '\n';
    session.process.stdin.write(json);
  }

  /**
   * 停止会话
   */
  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      console.log(`[Claude] 停止会话: ${sessionId}`);
      session.process.kill('SIGTERM');
      this.sessions.delete(sessionId);
    }
  }

  /**
   * 获取会话状态
   */
  getSessionStatus(sessionId: string): 'idle' | 'running' | 'waiting-permission' | null {
    const session = this.sessions.get(sessionId);
    return session ? session.status : null;
  }
}
```

#### `desktop/src/wsClient.ts`

```typescript
import WebSocket from 'ws';
import { WSMessage, ClientMessage } from './types';

export class WSClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageHandlers = new Map<string, (data: any) => void>();
  private isManualClose = false;

  constructor(
    private serverUrl: string,
    private deviceId: string,
    private hostname: string,
    private reconnectInterval: number = 5000,
    private heartbeatInterval: number = 30000
  ) {}

  /**
   * 连接到服务器
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[WS] 正在连接: ${this.serverUrl}`);

      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        console.log('[WS] ✅ 已连接到服务器');

        // 注册为桌面客户端
        this.send({
          type: 'register',
          deviceId: this.deviceId,
          deviceType: 'desktop',
          hostname: this.hostname
        });

        // 启动心跳
        this.startHeartbeat();

        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (e) {
          console.error('[WS] 解析消息失败:', e);
        }
      });

      this.ws.on('close', () => {
        console.log('[WS] ❌ 连接已断开');
        this.stopHeartbeat();

        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        console.error('[WS] 错误:', error.message);
        reject(error);
      });
    });
  }

  /**
   * 注册消息处理器
   */
  on(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(message: any): void {
    console.log(`[WS] ← 收到消息: ${message.type}`);

    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    } else {
      console.log('[WS] 未处理的消息类型:', message.type);
    }
  }

  /**
   * 发送消息到服务器
   */
  send(message: ClientMessage | any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[WS] 连接未就绪，无法发送消息');
      return;
    }

    console.log(`[WS] → 发送消息: ${message.type}`);
    this.ws.send(JSON.stringify(message));
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping' });
    }, this.heartbeatInterval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    console.log(`[WS] 将在 ${this.reconnectInterval}ms 后重连...`);

    this.reconnectTimer = setInterval(() => {
      console.log('[WS] 尝试重连...');

      this.connect()
        .then(() => {
          if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
          }
        })
        .catch((error) => {
          console.error('[WS] 重连失败:', error.message);
        });
    }, this.reconnectInterval);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.isManualClose = true;

    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    console.log('[WS] 已断开连接');
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
```

#### `desktop/src/index.ts`

```typescript
import { WSClient } from './wsClient';
import { ClaudeManager } from './claudeManager';
import { config } from './config';
import { UserMessageData, PermissionResponseData } from './types';

async function main() {
  console.log('┌─────────────────────────────────────┐');
  console.log('│  Claude Code Desktop Client v1.0.0  │');
  console.log('└─────────────────────────────────────┘');
  console.log();
  console.log(`📱 设备ID: ${config.deviceId}`);
  console.log(`🖥️  主机名: ${config.hostname}`);
  console.log(`🌐 服务器: ${config.serverUrl}`);
  console.log(`⚙️  Claude: ${config.claudePath}`);
  console.log();

  // 创建 WebSocket 客户端
  const wsClient = new WSClient(
    config.serverUrl,
    config.deviceId,
    config.hostname,
    config.reconnectInterval,
    config.heartbeatInterval
  );

  // 创建 Claude 管理器
  const claudeManager = new ClaudeManager();

  // 权限请求的 Promise resolvers
  const permissionResolvers = new Map<string, (approved: boolean) => void>();

  try {
    // 连接到服务器
    await wsClient.connect();

    // 处理用户消息（来自手机）
    wsClient.on('user-message', async (data: UserMessageData) => {
      console.log('');
      console.log('═══════════════════════════════════════');
      console.log(`📨 收到用户消息 (Session: ${data.sessionId})`);
      console.log(`📝 内容: ${data.content}`);
      console.log(`📂 项目: ${data.projectPath}`);
      console.log('═══════════════════════════════════════');

      const { sessionId, content, projectPath, messageId } = data;

      // 启动 Claude 会话（如果还没启动）
      if (!claudeManager.getSessionStatus(sessionId)) {
        await claudeManager.startSession(
          sessionId,
          projectPath,
          {
            // 输出回调：发送到服务器 → 转发到手机
            onOutput: (sid, content, mid) => {
              wsClient.send({
                type: 'output-chunk',
                sessionId: sid,
                content: content,
                messageId: mid
              });
            },

            // 权限请求回调：发送到服务器 → 等待手机响应
            onPermissionRequest: (sid, requestId, toolName, input) => {
              return new Promise<boolean>((resolve) => {
                // 保存 resolver
                permissionResolvers.set(requestId, resolve);

                // 发送权限请求到服务器
                wsClient.send({
                  type: 'permission-request',
                  sessionId: sid,
                  requestId,
                  toolName,
                  input
                });

                // 超时处理
                setTimeout(() => {
                  if (permissionResolvers.has(requestId)) {
                    console.log(`[Permission] 请求超时: ${requestId}`);
                    permissionResolvers.delete(requestId);
                    resolve(false);
                  }
                }, config.permissionTimeout);
              });
            },

            // 状态变化回调
            onStatusChange: (sid, status) => {
              wsClient.send({
                type: 'status',
                sessionId: sid,
                status
              });
            },

            // 就绪回调
            onReady: (sid) => {
              wsClient.send({
                type: 'session-ready',
                sessionId: sid
              });
            }
          }
        );
      }

      // 发送消息给 Claude
      claudeManager.sendMessage(sessionId, content, messageId);
    });

    // 处理权限响应（来自手机）
    wsClient.on('permission-response', (data: PermissionResponseData) => {
      console.log('');
      console.log('───────────────────────────────────────');
      console.log(`🔐 收到权限响应: ${data.requestId}`);
      console.log(`✓ 结果: ${data.approved ? '✅ 批准' : '❌ 拒绝'}`);
      console.log('───────────────────────────────────────');

      const resolver = permissionResolvers.get(data.requestId);
      if (resolver) {
        resolver(data.approved);
        permissionResolvers.delete(data.requestId);
      }
    });

    // 处理 pong
    wsClient.on('pong', () => {
      // 心跳响应
    });

    console.log('✅ 桌面客户端已启动，等待消息...');
    console.log();

  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }

  // 优雅退出
  process.on('SIGINT', () => {
    console.log();
    console.log('👋 正在退出...');
    wsClient.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log();
    console.log('👋 正在退出...');
    wsClient.disconnect();
    process.exit(0);
  });
}

// 启动
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

#### `desktop/package.json`

```json
{
  "name": "claude-code-desktop-client",
  "version": "1.0.0",
  "description": "Desktop client for Claude Code Mobile",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "build": "tsc",
    "dev": "tsx watch src/index.ts"
  },
  "keywords": ["claude", "desktop", "acp"],
  "author": "",
  "license": "MIT",
  "dependencies": {
    "ws": "^8.18.0",
    "uuid": "^11.1.0",
    "dotenv": "^16.4.7"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "@types/ws": "^8.5.13",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.7.2",
    "tsx": "^4.20.4"
  }
}
```

#### `desktop/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### `desktop/.env.example`

```env
# 服务器配置
SERVER_URL=ws://47.99.75.219:3001/ws

# Claude 配置
CLAUDE_PATH=/Users/你的用户名/.local/bin/claude
DEFAULT_PROJECT_PATH=/Users/你的用户名/Documents/code
```

---

## Task 2: 服务器改造（设备路由 + 状态管理）(Day 3-4)

### 2.1 新增设备管理模块

[继续...]
