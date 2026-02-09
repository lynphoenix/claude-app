# Plan B: 基于Happy的全面重构实施计划

> 计划时间：2026-02-09
> 预计周期：2-3周
> 目标：构建一个完整的多设备Claude Code会话管理系统

---

## 🎯 核心目标

构建一个功能完整的系统，支持：

1. ✅ **Server Backend** - 管理多设备的Claude Code sessions
2. ✅ **Desktop Daemon** - 在H100/A100等服务器上运行，管理Claude进程
3. ✅ **Mobile App** - 控制Claude、批准权限、查看消息
4. ✅ **Web Interface** - Mac/Windows浏览器访问
5. ✅ **CLI Tool** - 终端命令行访问
6. ✅ **消息同步** - 多设备间实时双向同步
7. ✅ **权限控制** - 标准化的permission protocol (基于ACP)
8. ✅ **Agent抽象** - 支持多种AI模型的统一接口

---

## 📂 Git分支策略

### 分支命名

```bash
# 主开发分支
refactor/happy-full-arch

# 子分支（每个Phase）
refactor/happy-full-arch-phase1-agent
refactor/happy-full-arch-phase2-daemon
refactor/happy-full-arch-phase3-rpc
refactor/happy-full-arch-phase4-web
refactor/happy-full-arch-phase5-cli
refactor/happy-full-arch-phase6-integration
```

### 创建分支

```bash
# 从当前dev分支创建
cd /Users/linyining/Documents/code/diy/claude-app
git checkout dev
git pull origin dev

# 创建主重构分支
git checkout -b refactor/happy-full-arch

# 立即创建远程分支（保护工作）
git push -u origin refactor/happy-full-arch
```

### 合并策略

```
refactor/happy-full-arch-phase1 → refactor/happy-full-arch → dev → main
```

每个Phase完成后：
1. 合并到主重构分支
2. 测试通过后合并到dev
3. 最终稳定后合并到main

---

## 🗓️ Phase划分总览

| Phase | 名称 | 周期 | 优先级 | 阻塞关系 |
|-------|------|------|--------|----------|
| **Phase 1** | Agent System重构 | 2-3天 | 🔥 最高 | 无依赖 |
| **Phase 2** | Daemon + API Client | 2天 | 🔥 最高 | 依赖Phase 1 |
| **Phase 3** | RPC System | 2天 | ⭐ 高 | 依赖Phase 2 |
| **Phase 4** | Web Interface | 2-3天 | ⭐ 高 | 依赖Phase 2 |
| **Phase 5** | CLI Tool | 1-2天 | 🟡 中 | 依赖Phase 2 |
| **Phase 6** | 集成测试 + 优化 | 2-3天 | 🟡 中 | 依赖所有 |

**总计**: 11-15天（约2-3周）

---

## Phase 1: Agent System重构（2-3天）

### 目标

✅ 使用Happy的Agent抽象层替代直接spawn Claude CLI
✅ 修复permission协议问题（使用ACP Backend）
✅ 支持未来扩展其他AI模型

### Git分支

```bash
git checkout refactor/happy-full-arch
git checkout -b refactor/happy-full-arch-phase1-agent
```

### 1.1 创建Agent抽象接口（第1天上午）

**新建文件**: `desktop/src/agent/AgentBackend.ts`

```typescript
/**
 * Agent Backend Interface
 * 统一的AI Agent后端抽象
 */

export interface AgentMessage {
  type: 'model-output' | 'tool-call' | 'tool-result' | 'error' | 'session-start';
  textDelta?: string;
  toolCall?: {
    id: string;
    kind: string;
    input: any;
  };
  toolResult?: {
    id: string;
    output: string;
    isError?: boolean;
  };
  error?: string;
  sessionId?: string;
}

export interface PermissionHandler {
  handleToolCall(
    toolCallId: string,
    toolName: string,
    input: any
  ): Promise<{
    decision: 'approved' | 'denied' | 'approved_for_session' | 'abort';
  }>;
}

export interface AgentBackend {
  // 生命周期
  startSession(initialPrompt?: string): Promise<{ sessionId?: string }>;
  sendPrompt(sessionId: string, prompt: string): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  dispose(): Promise<void>;

  // 事件订阅
  onMessage(handler: (msg: AgentMessage) => void): void;

  // 权限处理（可选，ACP Backend需要）
  respondToPermission?(requestId: string, approved: boolean): Promise<void>;

  // 状态查询
  isRunning(): boolean;
}

export interface AgentBackendOptions {
  agentName: string;
  cwd: string;
  sessionId?: string;  // Resume existing session
  apiConfig?: {
    baseUrl?: string;
    authToken?: string;
    model?: string;
  };
  permissionHandler?: PermissionHandler;
}
```

### 1.2 实现ACP Backend（第1天下午 + 第2天上午）

**新建文件**: `desktop/src/agent/AcpBackend.ts`

从Happy CLI复用核心逻辑：

```typescript
/**
 * ACP Backend Implementation
 * 基于Happy CLI的AcpBackend实现
 * 参考: happy/packages/happy-cli/src/agent/acp/AcpBackend.ts
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  AgentBackend,
  AgentBackendOptions,
  AgentMessage,
  PermissionHandler
} from './AgentBackend';

export class AcpBackend extends EventEmitter implements AgentBackend {
  private process: ChildProcess | null = null;
  private options: AgentBackendOptions;
  private messageHandlers: Array<(msg: AgentMessage) => void> = [];
  private pendingPermissions = new Map<string, {
    resolve: (approved: boolean) => void;
    reject: (error: Error) => void;
  }>();

  constructor(options: AgentBackendOptions) {
    super();
    this.options = options;
  }

  async startSession(initialPrompt?: string): Promise<{ sessionId?: string }> {
    // Spawn Claude CLI with ACP protocol
    const args = [
      '--print',
      '--input-format', 'acp',
      '--output-format', 'acp',
      '--no-session-persistence'
    ];

    if (this.options.sessionId) {
      args.push('--resume', this.options.sessionId);
    }

    this.process = spawn('claude', args, {
      cwd: this.options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...(this.options.apiConfig?.baseUrl && {
          ANTHROPIC_BASE_URL: this.options.apiConfig.baseUrl
        }),
        ...(this.options.apiConfig?.authToken && {
          ANTHROPIC_AUTH_TOKEN: this.options.apiConfig.authToken
        }),
        ...(this.options.apiConfig?.model && {
          ANTHROPIC_MODEL: this.options.apiConfig.model
        })
      }
    });

    this.setupStreams();

    if (initialPrompt) {
      await this.sendPrompt('', initialPrompt);
    }

    return {};
  }

  private setupStreams(): void {
    if (!this.process) return;

    // 处理stdout (ACP协议的JSON消息)
    this.process.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      const lines = text.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const msg = JSON.parse(line);
          this.handleAcpMessage(msg);
        } catch (error) {
          console.error('[AcpBackend] Failed to parse ACP message:', error);
        }
      }
    });

    // 处理stderr
    this.process.stderr?.on('data', (data: Buffer) => {
      console.error('[AcpBackend] stderr:', data.toString());
    });

    // 处理进程退出
    this.process.on('exit', (code) => {
      console.log(`[AcpBackend] Process exited with code ${code}`);
      this.process = null;
    });
  }

  private async handleAcpMessage(msg: any): Promise<void> {
    // 处理不同类型的ACP消息
    if (msg.type === 'model_output') {
      // Claude的文本输出
      this.emitMessage({
        type: 'model-output',
        textDelta: msg.text
      });
    } else if (msg.type === 'tool_call') {
      // 工具调用（需要权限）
      await this.handleToolCall(msg);
    } else if (msg.type === 'tool_result') {
      // 工具执行结果
      this.emitMessage({
        type: 'tool-result',
        toolResult: {
          id: msg.tool_call_id,
          output: msg.output,
          isError: msg.is_error
        }
      });
    }
  }

  private async handleToolCall(msg: any): Promise<void> {
    const { id: toolCallId, kind: toolName, input } = msg;

    if (!this.options.permissionHandler) {
      // 没有权限处理器，默认拒绝
      await this.respondToToolCall(toolCallId, false);
      return;
    }

    // 调用权限处理器
    const result = await this.options.permissionHandler.handleToolCall(
      toolCallId,
      toolName,
      input
    );

    const approved = result.decision === 'approved' ||
                     result.decision === 'approved_for_session';

    await this.respondToToolCall(toolCallId, approved);
  }

  private async respondToToolCall(
    toolCallId: string,
    approved: boolean
  ): Promise<void> {
    if (!this.process?.stdin) return;

    // ACP协议的权限响应格式
    const response = {
      type: 'tool_permission_response',
      tool_call_id: toolCallId,
      outcome: approved ? 'proceed_once' : 'cancel'
    };

    const jsonLine = JSON.stringify(response) + '\n';
    this.process.stdin.write(jsonLine);
  }

  async sendPrompt(sessionId: string, prompt: string): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Process not running');
    }

    const message = {
      type: 'user_message',
      content: prompt
    };

    const jsonLine = JSON.stringify(message) + '\n';
    this.process.stdin.write(jsonLine);
  }

  async cancel(sessionId: string): Promise<void> {
    this.process?.kill('SIGTERM');
  }

  async dispose(): Promise<void> {
    this.process?.kill('SIGTERM');
    this.messageHandlers = [];
  }

  onMessage(handler: (msg: AgentMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  private emitMessage(msg: AgentMessage): void {
    this.messageHandlers.forEach(handler => handler(msg));
  }

  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }
}
```

### 1.3 改造ClaudeProcessPool（第2天下午）

**修改文件**: `desktop/src/claudeProcessPool.ts`

将ProcessPool改为管理AgentBackend而非ClaudeProcess：

```typescript
import { AgentBackend, AgentBackendOptions } from './agent/AgentBackend';
import { AcpBackend } from './agent/AcpBackend';

export class ClaudeProcessPool extends EventEmitter {
  private backends = new Map<string, {
    backend: AgentBackend;  // 改为AgentBackend
    projectPath: string;
    lastUsed: number;
    sessionId?: string;
  }>();

  async getOrCreateProcess(
    projectPath: string,
    options: AgentBackendOptions
  ): Promise<AgentBackend> {
    // 检查是否已有backend
    const existing = this.backends.get(projectPath);
    if (existing && existing.backend.isRunning()) {
      existing.lastUsed = Date.now();
      this.currentProjectPath = projectPath;
      return existing.backend;
    }

    // 创建新的AcpBackend
    const backend = new AcpBackend({
      agentName: 'claude',
      cwd: projectPath,
      sessionId: options.sessionId,
      apiConfig: options.apiConfig,
      permissionHandler: {
        handleToolCall: async (toolCallId, toolName, input) => {
          // Emit to Desktop main
          this.emit('permission-request', projectPath, {
            toolCallId,
            toolName,
            input
          });

          // 等待Desktop main的响应（通过promise）
          return new Promise((resolve) => {
            this.once(`permission-response:${toolCallId}`, (approved: boolean) => {
              resolve({
                decision: approved ? 'approved' : 'denied'
              });
            });
          });
        }
      }
    });

    // 订阅消息
    backend.onMessage((msg) => {
      if (this.currentProjectPath === projectPath) {
        this.emit('message', projectPath, msg);
      }
    });

    await backend.startSession();

    this.backends.set(projectPath, {
      backend,
      projectPath,
      lastUsed: Date.now()
    });

    this.currentProjectPath = projectPath;
    return backend;
  }

  // 响应权限请求
  respondToPermission(toolCallId: string, approved: boolean): void {
    this.emit(`permission-response:${toolCallId}`, approved);
  }
}
```

### 1.4 更新Desktop主入口（第3天上午）

**修改文件**: `desktop/src/index.ts`

```typescript
// 使用新的AgentBackend系统
import { ClaudeProcessPool } from './claudeProcessPool.js';

// Permission请求处理（现在从AgentBackend来）
processPool.on('permission-request', (projectPath, request) => {
  const requestId = uuidv4();

  pendingPermissions.set(requestId, {
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    input: request.input
  });

  // 发送到Mobile
  wsClient.send({
    type: 'permission-request',
    sessionId: currentSessionId,
    data: {
      requestId,
      toolName: request.toolName,
      input: request.input
    }
  });
});

// Permission响应处理
wsClient.on('permission-response', (data) => {
  const pending = pendingPermissions.get(data.id);
  if (!pending) return;

  // 通知ProcessPool响应权限
  processPool.respondToPermission(pending.toolCallId, data.approved);

  pendingPermissions.delete(data.id);
});

// 消息处理（从AgentBackend来）
processPool.on('message', (projectPath, msg) => {
  if (msg.type === 'model-output') {
    wsClient.sendOutputChunk(currentSessionId, msg.textDelta || '', false);
  } else if (msg.type === 'tool-result') {
    console.log(`Tool ${msg.toolResult?.id} completed`);
  }
});
```

### 1.5 测试验证（第3天下午）

**测试清单**:

```bash
# 1. 编译
cd desktop
npm run build

# 2. 在H100上测试
npm run dev

# 3. 验证场景
# - 启动Claude会话
# - 发送需要权限的命令（如：创建文件夹）
# - Mobile端批准权限
# - 验证命令执行成功
# - 查看日志确认使用ACP协议
```

**预期结果**:
- ✅ Permission请求能正确发送到Mobile
- ✅ Permission响应能被Claude识别
- ✅ 命令成功执行
- ✅ 无ZodError或格式错误

### 完成标准

- [ ] AgentBackend接口定义完成
- [ ] AcpBackend实现完成并测试通过
- [ ] ClaudeProcessPool改造完成
- [ ] Desktop主入口更新完成
- [ ] Permission协议100%工作
- [ ] 合并到主重构分支

---

## Phase 2: Daemon + API Client（2天）

### 目标

✅ 创建Desktop Daemon（后台常驻）
✅ 实现与Server的API通信
✅ Keep-alive心跳机制
✅ 设备注册和认证

### Git分支

```bash
git checkout refactor/happy-full-arch
git merge refactor/happy-full-arch-phase1-agent
git checkout -b refactor/happy-full-arch-phase2-daemon
```

### 2.1 创建API Client（第1天上午）

**新建文件**: `desktop/src/api/ApiClient.ts`

```typescript
/**
 * API Client for Server Communication
 * 参考: happy/packages/happy-cli/src/api/api.ts
 */

import axios, { AxiosInstance } from 'axios';

export interface DeviceInfo {
  id: string;
  type: 'desktop' | 'mobile';
  displayName: string;
  platform?: string;
  version?: string;
}

export interface SessionInfo {
  id: string;
  deviceId: string;
  projectPath: string;
  claudeSessionId?: string;
  createdAt: number;
  updatedAt: number;
}

export class ApiClient {
  private axios: AxiosInstance;
  private deviceId: string;

  constructor(
    baseUrl: string,
    deviceId: string,
    authToken?: string
  ) {
    this.deviceId = deviceId;
    this.axios = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      headers: authToken ? {
        'Authorization': `Bearer ${authToken}`
      } : {}
    });
  }

  // 设备注册
  async registerDevice(info: DeviceInfo): Promise<void> {
    await this.axios.post('/api/devices/register', info);
  }

  // 心跳
  async heartbeat(): Promise<{ version?: string }> {
    const response = await this.axios.post('/api/devices/heartbeat', {
      deviceId: this.deviceId,
      timestamp: Date.now()
    });
    return response.data;
  }

  // Session管理
  async getOrCreateSession(
    deviceId: string,
    projectPath: string
  ): Promise<SessionInfo> {
    const response = await this.axios.post('/api/sessions', {
      deviceId,
      projectPath
    });
    return response.data;
  }

  async updateSessionMetadata(
    sessionId: string,
    metadata: {
      claudeSessionId?: string;
      thinking?: boolean;
      mode?: 'local' | 'remote';
    }
  ): Promise<void> {
    await this.axios.patch(`/api/sessions/${sessionId}`, metadata);
  }

  // 消息存储（可选，如果需要服务器端持久化）
  async storeMessage(sessionId: string, message: any): Promise<void> {
    await this.axios.post(`/api/sessions/${sessionId}/messages`, message);
  }
}
```

### 2.2 创建Daemon入口（第1天下午）

**新建文件**: `desktop/src/daemon.ts`

```typescript
/**
 * Desktop Daemon
 * 后台常驻进程，管理Claude会话
 * 参考: happy/packages/happy-cli/src/daemon/run.ts
 */

import { ApiClient } from './api/ApiClient';
import { WSClient } from './wsClient';
import { ClaudeProcessPool } from './claudeProcessPool';
import { loadConfig } from './config';

export class DesktopDaemon {
  private apiClient: ApiClient;
  private wsClient: WSClient;
  private processPool: ClaudeProcessPool;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor() {
    const config = loadConfig();

    this.apiClient = new ApiClient(
      config.serverUrl,
      config.deviceId
    );

    this.wsClient = new WSClient(
      config.serverUrl,
      config.deviceId,
      config.displayName
    );

    this.processPool = new ClaudeProcessPool(3);
  }

  async start(): Promise<void> {
    console.log('🚀 Desktop Daemon starting...');

    // 1. 注册设备
    await this.apiClient.registerDevice({
      id: this.wsClient.deviceId,
      type: 'desktop',
      displayName: 'H100 Server',
      platform: process.platform,
      version: '1.0.0'
    });

    // 2. 连接WebSocket
    await this.wsClient.connect();

    // 3. 启动心跳（每60秒）
    this.startHeartbeat();

    // 4. 注册事件处理器
    this.setupEventHandlers();

    console.log('✅ Desktop Daemon ready!');
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      try {
        const result = await this.apiClient.heartbeat();

        // 检查版本更新
        if (result.version && result.version !== '1.0.0') {
          console.log(`⚠️  New version available: ${result.version}`);
          // TODO: 自动更新逻辑
        }
      } catch (error) {
        console.error('❌ Heartbeat failed:', error);
      }
    }, 60000);
  }

  private setupEventHandlers(): void {
    // 从ProcessPool转发消息到Server
    this.processPool.on('message', (projectPath, msg) => {
      // 发送到Server/Mobile
      this.wsClient.send({
        type: 'agent-message',
        data: msg
      });
    });

    // 从Server接收消息转发到ProcessPool
    this.wsClient.on('user-message', async (data) => {
      const currentBackend = this.processPool.getCurrentProcess();
      if (currentBackend) {
        await currentBackend.sendPrompt('', data.content);
      }
    });

    // 权限请求处理
    this.processPool.on('permission-request', (projectPath, request) => {
      this.wsClient.send({
        type: 'permission-request',
        data: request
      });
    });

    this.wsClient.on('permission-response', (data) => {
      this.processPool.respondToPermission(data.toolCallId, data.approved);
    });
  }

  async stop(): Promise<void> {
    console.log('👋 Desktop Daemon shutting down...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.processPool.stopAll();
    this.wsClient.disconnect();

    console.log('✅ Daemon stopped');
  }
}

// Main entry
const daemon = new DesktopDaemon();

daemon.start().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => daemon.stop());
process.on('SIGTERM', () => daemon.stop());
```

### 2.3 更新PM2配置（第2天上午）

**修改文件**: `desktop/ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [{
    name: 'claude-app-daemon',
    script: './dist/daemon.js',  // 新的daemon入口
    cwd: '/root/claude-app/desktop',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/root/logs/claude-app-daemon-error.log',
    out_file: '/root/logs/claude-app-daemon-out.log',
    merge_logs: true
  }]
};
```

### 2.4 测试验证（第2天下午）

```bash
# 1. 编译
npm run build

# 2. 在H100上测试
pm2 start ecosystem.config.cjs
pm2 logs claude-app-daemon

# 3. 验证
# - 设备注册成功
# - WebSocket连接成功
# - 心跳正常
# - 能接收Mobile消息
```

### 完成标准

- [ ] ApiClient实现完成
- [ ] Daemon入口创建完成
- [ ] 心跳机制工作正常
- [ ] PM2配置更新完成
- [ ] 与Server通信正常
- [ ] 合并到主重构分支

---

## Phase 3: RPC System（2天）

### 目标

✅ 实现远程文件操作（Mobile控制Desktop文件系统）
✅ bash, read, write, ls, tree, ripgrep等RPC命令

### Git分支

```bash
git checkout refactor/happy-full-arch
git merge refactor/happy-full-arch-phase2-daemon
git checkout -b refactor/happy-full-arch-phase3-rpc
```

### 3.1 创建RPC Handler（第1天）

**新建文件**: `desktop/src/rpc/handlers.ts`

参考Happy的RPC实现，支持：
- `bash` - 执行shell命令
- `read` - 读取文件
- `write` - 写入文件
- `ls` - 列出目录
- `tree` - 目录树
- `ripgrep` - 代码搜索

### 3.2 安全验证（第1天下午）

实现路径验证，确保所有操作都在项目目录内。

### 3.3 集成到Daemon（第2天）

将RPC handlers集成到Daemon的WebSocket消息处理中。

### 完成标准

- [ ] RPC handlers实现完成
- [ ] 路径安全验证完成
- [ ] Mobile能远程操作Desktop文件系统
- [ ] 合并到主重构分支

---

## Phase 4: Web Interface（2-3天）

### 目标

✅ Mac/Windows用户通过浏览器访问
✅ 显示会话列表、消息历史
✅ 发送消息、批准权限
✅ 实时更新（WebSocket）

### Git分支

```bash
git checkout refactor/happy-full-arch
git merge refactor/happy-full-arch-phase3-rpc
git checkout -b refactor/happy-full-arch-phase4-web
```

### 4.1 创建Web前端（第1-2天）

**新建目录**: `web/`

技术栈：
- React + TypeScript
- Vite构建
- WebSocket客户端
- TailwindCSS

### 4.2 实现核心页面（第2天）

- 登录页（设备注册）
- 会话列表页
- 聊天页面
- 权限批准对话框

### 4.3 部署配置（第3天）

- Nginx配置
- HTTPS证书
- 反向代理WebSocket

### 完成标准

- [ ] Web前端实现完成
- [ ] 与Server集成完成
- [ ] 部署到服务器
- [ ] Mac/Windows浏览器可访问
- [ ] 合并到主重构分支

---

## Phase 5: CLI Tool（1-2天）

### 目标

✅ 终端命令行工具
✅ `claude-app attach <session>` 连接到现有会话
✅ `claude-app list` 列出所有会话
✅ `claude-app logs <session>` 查看日志

### Git分支

```bash
git checkout refactor/happy-full-arch
git merge refactor/happy-full-arch-phase4-web
git checkout -b refactor/happy-full-arch-phase5-cli
```

### 5.1 创建CLI工具（第1天）

**新建目录**: `cli/`

使用commander.js实现命令行工具。

### 5.2 实现attach功能（第1天下午）

连接到Server的WebSocket，attach到指定session。

### 5.3 发布为npm包（第2天）

可全局安装：`npm install -g @claude-app/cli`

### 完成标准

- [ ] CLI工具实现完成
- [ ] attach功能工作正常
- [ ] 发布为npm包
- [ ] 合并到主重构分支

---

## Phase 6: 集成测试 + 优化（2-3天）

### 目标

✅ 端到端测试
✅ 性能优化
✅ 文档完善
✅ Bug修复

### 6.1 端到端测试（第1天）

测试场景：
1. Mobile发送消息 → Desktop执行 → 结果返回Mobile
2. Desktop需要权限 → Mobile批准 → 命令执行
3. Web登录 → 查看会话 → 发送消息
4. CLI attach → 查看实时输出
5. 多设备同时连接同一session

### 6.2 性能优化（第2天）

- MessageQueue批处理
- WebSocket消息压缩
- 数据库查询优化
- 内存泄漏检查

### 6.3 文档完善（第2-3天）

- 用户使用手册
- 开发者文档
- API文档
- 部署文档

### 完成标准

- [ ] 所有端到端测试通过
- [ ] 性能达标（消息延迟<200ms）
- [ ] 文档完善
- [ ] 合并到dev分支
- [ ] 准备发布到main

---

## 📊 关键技术栈总结

### Desktop

- TypeScript + Node.js
- Agent System (ACP Backend)
- WebSocket客户端
- PM2进程管理
- API Client (axios)

### Server

- TypeScript + Express
- WebSocket服务器 (ws)
- DeviceManager路由
- 可选：PostgreSQL数据库（如果需要持久化）

### Mobile

- React Native + TypeScript
- WebSocket客户端
- 现有UI + 新增permission对话框

### Web

- React + TypeScript + Vite
- WebSocket客户端
- TailwindCSS

### CLI

- TypeScript + Node.js
- commander.js
- WebSocket客户端

---

## 🚨 风险控制

### 高风险项

1. **Permission协议兼容性** - ACP Backend可能仍有未知问题
   - **缓解**: Phase 1充分测试，失败则回退到stream-json + 调试

2. **多设备消息同步** - 并发消息可能乱序
   - **缓解**: 使用消息ID和timestamp排序，MessageQueue批处理

3. **WebSocket连接稳定性** - 网络断线重连
   - **缓解**: 实现断线重连机制，消息队列持久化

### 回滚计划

如果Phase 1-2失败：
1. 保留现有architecture
2. 只修复permission协议（使用Happy的Query SDK）
3. 实施Plan A（最小改动）

---

## 📝 每日检查清单

### 开发前

- [ ] 从主重构分支创建子分支
- [ ] 更新本地依赖
- [ ] 查看相关文档

### 开发中

- [ ] 每完成一个功能提交一次git
- [ ] 写清晰的commit message
- [ ] 添加必要的注释和文档

### 开发后

- [ ] 运行编译检查
- [ ] 在H100上测试
- [ ] 更新CHANGELOG
- [ ] 合并到主重构分支

---

## 🎯 成功标准

最终系统应满足：

1. ✅ Mobile可以控制H100/A100上的Claude进程
2. ✅ Permission请求能正确发送和响应（100%成功率）
3. ✅ 消息在多设备间实时同步（延迟<200ms）
4. ✅ Mac/Windows可通过Web访问
5. ✅ 终端用户可用CLI attach到会话
6. ✅ 系统稳定运行24小时无崩溃
7. ✅ 代码质量：TypeScript类型完整，无any滥用
8. ✅ 文档完善：用户手册、API文档、部署文档

---

**下一步**: 创建 `refactor/happy-full-arch` 分支，开始Phase 1实施！
