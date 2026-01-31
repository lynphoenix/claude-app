# Claude Code Mobile - 桌面客户端改造计划

## 架构目标

从当前的"服务器执行模式"改造为"桌面执行模式"：

```
当前架构：
手机 → 服务器(219) → 运行 Claude → 返回结果

目标架构：
手机 → 服务器(中转) → 桌面客户端 → 运行 Claude → 返回结果
```

---

## Phase 1: 桌面客户端基础 (Week 1)

### 1.1 创建桌面客户端项目

```bash
mkdir desktop
cd desktop
npm init -y
npm install ws @types/node typescript tsx
```

**目录结构：**
```
desktop/
├── src/
│   ├── client.ts          # 主入口
│   ├── claudeManager.ts   # Claude 进程管理
│   ├── wsClient.ts        # WebSocket 客户端
│   └── types.ts           # 类型定义
├── package.json
└── tsconfig.json
```

### 1.2 核心文件实现

#### `desktop/src/types.ts`

```typescript
// 消息类型定义
export interface ServerMessage {
  type: 'user-message' | 'permission-response' | 'switch-mode' | 'ping';
  sessionId: string;
  data: any;
}

export interface ClientMessage {
  type: 'register' | 'output-chunk' | 'permission-request' | 'status';
  sessionId: string;
  data: any;
}

export interface ClaudeProcess {
  sessionId: string;
  process: ChildProcess | null;
  status: 'idle' | 'running' | 'waiting-permission';
}
```

#### `desktop/src/claudeManager.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';

export class ClaudeManager {
  private processes = new Map<string, ChildProcess>();
  private claudePath: string;

  constructor() {
    this.claudePath = path.join(os.homedir(), '.local/bin/claude');
  }

  // 启动 Claude 进程（使用 SDK 模式）
  async startProcess(
    sessionId: string,
    projectPath: string,
    onOutput: (chunk: string) => void,
    onPermissionRequest: (request: any) => Promise<any>
  ): Promise<void> {
    const args = [
      '--continue',
      '--input-format', 'stream-json',  // 关键：支持 JSON 输入
      '--output-format', 'jsonl',
      '--permission-mode', 'default'
    ];

    const claudeProcess = spawn(this.claudePath, args, {
      cwd: projectPath,
      env: {
        ...process.env,
        PATH: process.env.PATH + ':' + path.join(os.homedir(), '.local/bin'),
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.processes.set(sessionId, claudeProcess);

    // 监听 stdout (JSONL 格式)
    let buffer = '';
    claudeProcess.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const message = JSON.parse(line);
            this.handleClaudeMessage(message, onOutput, onPermissionRequest);
          } catch (e) {
            console.error('解析 Claude 输出失败:', e);
          }
        }
      }
    });

    claudeProcess.stderr.on('data', (data: Buffer) => {
      console.error('Claude stderr:', data.toString());
    });

    claudeProcess.on('exit', (code) => {
      console.log(`Claude 进程退出: ${code}`);
      this.processes.delete(sessionId);
    });
  }

  // 处理 Claude 输出的消息
  private handleClaudeMessage(
    message: any,
    onOutput: (chunk: string) => void,
    onPermissionRequest: (request: any) => Promise<any>
  ) {
    switch (message.type) {
      case 'assistant':
        // 助手响应
        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text') {
              onOutput(block.text);
            }
          }
        }
        break;

      case 'control_request':
        // 权限请求
        if (message.subtype === 'can_use_tool') {
          this.handlePermissionRequest(message, onPermissionRequest);
        }
        break;

      default:
        console.log('Claude 消息:', message);
    }
  }

  // 处理权限请求
  private async handlePermissionRequest(
    request: any,
    onPermissionRequest: (request: any) => Promise<any>
  ) {
    const response = await onPermissionRequest({
      toolName: request.tool?.name || 'Unknown',
      input: request.tool?.input || {},
      requestId: request.request_id
    });

    // 发送权限响应给 Claude
    const process = this.processes.get(request.sessionId);
    if (process && process.stdin) {
      const controlResponse = {
        type: 'control_response',
        response: {
          request_id: request.request_id,
          outcome: response.approved ? 'approved' : 'denied'
        }
      };
      process.stdin.write(JSON.stringify(controlResponse) + '\n');
    }
  }

  // 发送消息给 Claude
  sendMessage(sessionId: string, content: string): void {
    const process = this.processes.get(sessionId);
    if (process && process.stdin) {
      const message = {
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: content }]
        }
      };
      process.stdin.write(JSON.stringify(message) + '\n');
    }
  }

  // 停止进程
  stopProcess(sessionId: string): void {
    const process = this.processes.get(sessionId);
    if (process) {
      process.kill('SIGTERM');
      this.processes.delete(sessionId);
    }
  }
}
```

#### `desktop/src/wsClient.ts`

```typescript
import WebSocket from 'ws';

export class WSClient {
  private ws: WebSocket | null = null;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  constructor(
    private serverUrl: string,
    private deviceId: string
  ) {}

  // 连接到服务器
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        console.log('✅ 已连接到服务器');

        // 注册为桌面客户端
        this.send({
          type: 'register',
          deviceId: this.deviceId,
          deviceType: 'desktop'
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
          console.error('解析服务器消息失败:', e);
        }
      });

      this.ws.on('close', () => {
        console.log('❌ 与服务器断开连接');
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket 错误:', error);
        reject(error);
      });
    });
  }

  // 注册消息处理器
  on(type: string, handler: (data: any) => void): void {
    this.messageHandlers.set(type, handler);
  }

  // 处理服务器消息
  private handleMessage(message: any): void {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message.data);
    } else {
      console.log('未处理的消息类型:', message.type);
    }
  }

  // 发送消息到服务器
  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket 未连接');
    }
  }

  // 心跳
  private startHeartbeat(): void {
    setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000);
  }

  // 重连
  private scheduleReconnect(): void {
    if (this.reconnectInterval) return;

    this.reconnectInterval = setInterval(() => {
      console.log('尝试重连...');
      this.connect().then(() => {
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          this.reconnectInterval = null;
        }
      }).catch(() => {
        // 重连失败，继续尝试
      });
    }, 5000);
  }

  // 断开连接
  disconnect(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
```

#### `desktop/src/client.ts`

```typescript
import { WSClient } from './wsClient';
import { ClaudeManager } from './claudeManager';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const serverUrl = 'ws://47.99.75.219:3001/ws';
  const deviceId = `desktop-${os.hostname()}`;

  console.log('🚀 启动桌面客户端...');
  console.log(`📱 设备ID: ${deviceId}`);

  // 创建 WebSocket 客户端
  const wsClient = new WSClient(serverUrl, deviceId);

  // 创建 Claude 管理器
  const claudeManager = new ClaudeManager();

  // 存储权限请求的 Promise resolvers
  const permissionRequests = new Map<string, (response: any) => void>();

  // 连接到服务器
  await wsClient.connect();

  // 处理服务器消息
  wsClient.on('user-message', async (data: any) => {
    console.log('📨 收到用户消息:', data.content);

    const sessionId = data.sessionId;
    const projectPath = data.projectPath || process.cwd();

    // 启动 Claude 进程（如果还没启动）
    await claudeManager.startProcess(
      sessionId,
      projectPath,
      // 输出回调：发送到服务器 → 转发到手机
      (chunk: string) => {
        wsClient.send({
          type: 'output-chunk',
          sessionId,
          data: { content: chunk }
        });
      },
      // 权限请求回调：发送到服务器 → 等待手机响应
      (request: any) => {
        return new Promise((resolve) => {
          const requestId = uuidv4();
          permissionRequests.set(requestId, resolve);

          wsClient.send({
            type: 'permission-request',
            sessionId,
            data: {
              requestId,
              toolName: request.toolName,
              input: request.input
            }
          });

          // 超时处理
          setTimeout(() => {
            if (permissionRequests.has(requestId)) {
              permissionRequests.delete(requestId);
              resolve({ approved: false, reason: 'Timeout' });
            }
          }, 60000);
        });
      }
    );

    // 发送消息给 Claude
    claudeManager.sendMessage(sessionId, data.content);
  });

  // 处理权限响应
  wsClient.on('permission-response', (data: any) => {
    console.log('✅ 收到权限响应:', data);
    const resolver = permissionRequests.get(data.requestId);
    if (resolver) {
      resolver({
        approved: data.approved,
        reason: data.reason
      });
      permissionRequests.delete(data.requestId);
    }
  });

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n👋 正在退出...');
    wsClient.disconnect();
    process.exit(0);
  });

  console.log('✅ 桌面客户端已启动，等待连接...');
}

main().catch(console.error);
```

#### `desktop/package.json`

```json
{
  "name": "claude-code-desktop-client",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/client.ts",
    "build": "tsc",
    "dev": "tsx watch src/client.ts"
  },
  "dependencies": {
    "ws": "^8.18.0",
    "uuid": "^11.1.0"
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
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

---

## Phase 2: 服务器改造 (Week 2)

### 2.1 服务器架构调整

**当前职责：** 执行 Claude CLI
**新职责：** 消息路由 + 状态管理

#### `server/src/deviceManager.ts`

```typescript
import { WebSocket } from 'ws';

export interface Device {
  id: string;
  type: 'mobile' | 'desktop';
  ws: WebSocket;
  sessionId: string | null;
  lastActive: number;
}

export class DeviceManager {
  private devices = new Map<string, Device>();

  // 注册设备
  registerDevice(deviceId: string, type: 'mobile' | 'desktop', ws: WebSocket): void {
    this.devices.set(deviceId, {
      id: deviceId,
      type,
      ws,
      sessionId: null,
      lastActive: Date.now()
    });
    console.log(`📱 设备注册: ${deviceId} (${type})`);
  }

  // 获取设备
  getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }

  // 广播消息给同一 session 的所有设备
  broadcastToSession(sessionId: string, message: any, excludeDeviceId?: string): void {
    for (const [deviceId, device] of this.devices) {
      if (device.sessionId === sessionId && deviceId !== excludeDeviceId) {
        if (device.ws.readyState === WebSocket.OPEN) {
          device.ws.send(JSON.stringify(message));
        }
      }
    }
  }

  // 发送消息给桌面客户端
  sendToDesktop(sessionId: string, message: any): void {
    for (const device of this.devices.values()) {
      if (device.sessionId === sessionId && device.type === 'desktop') {
        if (device.ws.readyState === WebSocket.OPEN) {
          device.ws.send(JSON.stringify(message));
        }
        break;
      }
    }
  }

  // 移除设备
  removeDevice(deviceId: string): void {
    this.devices.delete(deviceId);
    console.log(`❌ 设备断开: ${deviceId}`);
  }

  // 清理不活跃的设备
  cleanupInactive(maxAge: number = 300000): void {
    const now = Date.now();
    for (const [deviceId, device] of this.devices) {
      if (now - device.lastActive > maxAge) {
        this.removeDevice(deviceId);
      }
    }
  }
}
```

#### `server/src/index.ts` (改造版)

```typescript
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { DeviceManager } from './deviceManager.js';

const app = express();
const server = createServer(app);
const PORT = 3001;

app.use(cors());
app.use(express.json());

const wss = new WebSocketServer({ server, path: '/ws' });
const deviceManager = new DeviceManager();

wss.on('connection', (ws: WebSocket) => {
  let deviceId: string | null = null;
  let deviceType: 'mobile' | 'desktop' | null = null;

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('收到消息:', message.type, 'from', deviceId);

      switch (message.type) {
        case 'register':
          // 设备注册
          deviceId = message.deviceId;
          deviceType = message.deviceType;
          deviceManager.registerDevice(deviceId, deviceType, ws);

          ws.send(JSON.stringify({
            type: 'registered',
            deviceId,
            message: '设备注册成功'
          }));
          break;

        case 'init':
          // 手机初始化（绑定 session）
          if (deviceId) {
            const device = deviceManager.getDevice(deviceId);
            if (device) {
              device.sessionId = message.sessionId;
            }
          }

          ws.send(JSON.stringify({
            type: 'ready',
            sessionId: message.sessionId
          }));
          break;

        case 'message':
          // 手机发送消息 → 转发给桌面客户端
          console.log('📤 转发消息到桌面客户端');
          deviceManager.sendToDesktop(message.sessionId, {
            type: 'user-message',
            data: {
              sessionId: message.sessionId,
              content: message.content,
              projectPath: message.projectPath
            }
          });

          // 确认收到
          ws.send(JSON.stringify({
            type: 'messageAck',
            id: message.id
          }));
          break;

        case 'output-chunk':
          // 桌面客户端输出 → 转发给手机
          console.log('📤 转发输出到手机');
          deviceManager.broadcastToSession(
            message.sessionId,
            {
              type: 'responseChunk',
              content: message.data.content,
              messageId: message.messageId
            },
            deviceId || undefined
          );
          break;

        case 'permission-request':
          // 桌面客户端权限请求 → 转发给手机
          console.log('🔐 转发权限请求到手机');
          deviceManager.broadcastToSession(
            message.sessionId,
            {
              type: 'permissionRequest',
              requestId: message.data.requestId,
              toolName: message.data.toolName,
              input: message.data.input
            },
            deviceId || undefined
          );
          break;

        case 'permission-response':
          // 手机权限响应 → 转发给桌面客户端
          console.log('✅ 转发权限响应到桌面');
          deviceManager.sendToDesktop(message.sessionId, {
            type: 'permission-response',
            data: {
              requestId: message.requestId,
              approved: message.approved,
              reason: message.reason
            }
          });
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.log('未知消息类型:', message.type);
      }
    } catch (error) {
      console.error('处理消息错误:', error);
    }
  });

  ws.on('close', () => {
    if (deviceId) {
      deviceManager.removeDevice(deviceId);
    }
  });
});

// 定期清理不活跃设备
setInterval(() => {
  deviceManager.cleanupInactive();
}, 60000);

server.listen(PORT, () => {
  console.log(`✅ 服务器运行在端口 ${PORT}`);
});
```

---

## Phase 3: 手机端适配 (Week 3)

### 3.1 权限请求 UI

#### `mobile/src/components/PermissionDialog.tsx`

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import tw from 'twrnc';

interface PermissionDialogProps {
  visible: boolean;
  toolName: string;
  input: any;
  onApprove: () => void;
  onDeny: () => void;
}

export function PermissionDialog({
  visible,
  toolName,
  input,
  onApprove,
  onDeny
}: PermissionDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={tw`flex-1 bg-black/50 justify-center items-center`}>
        <View style={tw`bg-white rounded-lg p-6 w-80`}>
          <Text style={tw`text-xl font-bold mb-4`}>权限请求</Text>

          <View style={tw`mb-4`}>
            <Text style={tw`text-gray-600 mb-2`}>工具: {toolName}</Text>
            <Text style={tw`text-sm text-gray-500`}>
              {JSON.stringify(input, null, 2)}
            </Text>
          </View>

          <View style={tw`flex-row gap-2`}>
            <TouchableOpacity
              style={tw`flex-1 bg-red-500 py-3 rounded`}
              onPress={onDeny}
            >
              <Text style={tw`text-white text-center font-bold`}>拒绝</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={tw`flex-1 bg-green-500 py-3 rounded`}
              onPress={onApprove}
            >
              <Text style={tw`text-white text-center font-bold`}>批准</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

### 3.2 WebSocket 服务适配

#### `mobile/src/services/websocket.ts` (修改)

```typescript
// 新增权限请求处理
ws.on('permissionRequest', (data: any) => {
  // 显示权限对话框
  setPermissionRequest({
    requestId: data.requestId,
    toolName: data.toolName,
    input: data.input,
    visible: true
  });
});

// 发送权限响应
function sendPermissionResponse(requestId: string, approved: boolean) {
  ws.send({
    type: 'permission-response',
    sessionId: currentSessionId,
    requestId,
    approved,
    reason: approved ? 'User approved' : 'User denied'
  });
}
```

---

## 快速启动指南

### 1. 安装桌面客户端

```bash
cd /Users/linyining/Documents/code/diy/claude-app/desktop
npm install
npm start
```

### 2. 更新服务器

```bash
cd /Users/linyining/Documents/code/diy/claude-app/server
npm run build
pm2 restart claude-code-server
```

### 3. 测试流程

```
1. 桌面客户端启动 → 连接到服务器
2. 手机 App 发送消息
3. 服务器转发到桌面
4. 桌面运行 Claude → 输出回传
5. 手机显示结果
```

---

## 后续优化方向

- [ ] **Phase 4**: 设备切换（Local/Remote Mode）
- [ ] **Phase 5**: 加密通信（E2E）
- [ ] **Phase 6**: 推送通知
- [ ] **Phase 7**: 多设备状态同步
- [ ] **Phase 8**: 离线缓存和恢复

---

## 关键差异总结

| 方面 | 当前架构 | 新架构 |
|------|---------|--------|
| Claude 运行位置 | 服务器 (219) | 用户电脑 |
| 文件操作 | 服务器文件系统 | 用户电脑文件系统 |
| Bash 执行 | 服务器 shell | 用户电脑 shell |
| 服务器角色 | 执行节点 | 中转节点 |
| 权限确认 | 简陋 | 完整 UI |
| 设备切换 | 不支持 | 支持 (Phase 4) |

---

**下一步：立即创建 desktop 项目！**
