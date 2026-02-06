# Happy 项目架构深度调研报告

> 调研时间：2026-02-06
> 调研对象：Happy CLI 项目（移动端远程控制Claude Code）
> 项目地址：/Users/linyining/Documents/code/happy

---

## 目录

- [一、整体架构概览](#一整体架构概览)
- [二、权限请求机制](#二权限请求机制)
- [三、Claude CLI集成方式](#三claude-cli集成方式)
- [四、消息流转机制](#四消息流转机制)
- [五、状态同步机制](#五状态同步机制)
- [六、与用户项目的对比](#六与用户项目的对比)
- [七、总结](#七总结)

---

## 一、整体架构概览

### 1.1 三大组件关系

Happy 项目由三个核心组件构成：

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Happy CLI     │◄───────►│  Happy Server    │◄───────►│   Happy App     │
│  (Desktop CLI)  │  Socket │  (中继服务器)     │  Socket │  (Mobile/Web)   │
│                 │         │                  │         │                 │
│ • Local Mode    │         │ • 消息路由        │         │ • 发送消息       │
│ • Remote Mode   │         │ • RPC转发        │         │ • 权限审批       │
│ • Claude CLI    │         │ • 加密通信        │         │ • 实时同步       │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

**核心职责：**

- **Happy CLI**: 桌面端代理，管理 Claude CLI 的启动和运行，处理文件系统操作
- **Happy Server**: 中央服务器，负责 WebSocket 消息路由、RPC 调用转发、数据持久化
- **Happy App**: 移动端客户端，用户交互界面，发送消息和审批权限

### 1.2 Local 模式 vs Remote 模式

这是 Happy 架构中最核心的设计，两种模式的本质区别：

| 维度 | Local 模式 | Remote 模式 |
|------|-----------|------------|
| **Claude CLI 运行方式** | 直接在终端运行（交互式） | 通过 SDK spawn 子进程 |
| **控制权** | 用户在终端直接控制 | 移动端远程控制 |
| **权限请求** | 在终端手动审批 | 自动发送到移动端审批 |
| **消息输入** | 终端键盘输入 | 移动端发送消息队列 |
| **启动器** | `claude_local_launcher.cjs` | `claude_remote_launcher.cjs` |
| **适用场景** | 开发调试、本地操作 | 远程协作、移动办公 |

**模式切换流程：**

```typescript
// 文件：packages/happy-cli/src/claude/loop.ts
export async function loop(opts: LoopOptions): Promise<number> {
    let mode: 'local' | 'remote' = opts.startingMode ?? 'local';

    while (true) {
        switch (mode) {
            case 'local':
                const result = await claudeLocalLauncher(session);
                if (result.type === 'switch') {
                    mode = 'remote'; // 切换到 remote
                    opts.onModeChange?.(mode);
                }
                break;

            case 'remote':
                const reason = await claudeRemoteLauncher(session);
                if (reason === 'switch') {
                    mode = 'local'; // 切换到 local
                    opts.onModeChange?.(mode);
                }
                break;
        }
    }
}
```

---

## 二、权限请求机制

### 2.1 权限请求的产生

权限请求在两种模式下的产生方式完全不同：

#### **Local 模式：**
- 权限请求在 Claude CLI 内部处理
- 终端显示权限提示，用户手动输入 y/n
- Happy CLI 只负责监听 Claude 的输出，不参与权限审批

#### **Remote 模式：**
- 通过 SDK 的 `canCallTool` 回调机制产生
- 每个工具调用都会触发权限检查

```typescript
// 文件：packages/happy-cli/src/claude/sdk/query.ts
export function query(config: { prompt, options }) {
    const args = ['--permission-prompt-tool', 'stdio'];

    // SDK 通过 stdin/stdout 与 CLI 通信
    // 当 Claude 想调用工具时，SDK 会通过控制消息询问权限
    const query = new Query(childStdin, child.stdout, processExitPromise, canCallTool);
}

// 文件：packages/happy-cli/src/claude/utils/permissionHandler.ts
handleToolCall = async (toolName, input, mode, options) => {
    // 1. 检查是否已授权
    if (this.allowedTools.has(toolName)) {
        return { behavior: 'allow' };
    }

    // 2. 检查权限模式
    if (this.permissionMode === 'bypassPermissions') {
        return { behavior: 'allow' };
    }

    // 3. 生成权限请求
    const toolCallId = this.resolveToolCallId(toolName, input);
    return this.handlePermissionRequest(toolCallId, toolName, input, signal);
}
```

### 2.2 权限请求的传递路径

完整的权限请求流程：

```
┌──────────────┐
│ Claude 想调用 │
│  工具 (Bash)  │
└──────┬───────┘
       │
       ▼
┌────────────────────┐
│ SDK canCallTool    │ (query.ts)
│ 回调被触发          │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ PermissionHandler  │ (permissionHandler.ts)
│ handleToolCall     │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ 更新 AgentState    │ (apiSession.ts)
│ requests: {        │
│   [id]: {          │
│     tool,          │
│     arguments,     │
│     createdAt      │
│   }                │
│ }                  │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ 通过 Socket 发送    │ (apiSession.ts)
│ update-state 事件  │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ Happy Server       │ (sessionUpdateHandler.ts)
│ 更新数据库          │
│ 广播到所有客户端    │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ Happy App          │ (sync.ts)
│ 接收 update 事件   │
│ 显示权限请求 UI    │
└────────────────────┘
```

**关键代码：**

```typescript
// 1. CLI 发送权限请求（packages/happy-cli/src/claude/utils/permissionHandler.ts）
private async handlePermissionRequest(id, toolName, input, signal) {
    // 更新 AgentState
    this.session.client.updateAgentState((currentState) => ({
        ...currentState,
        requests: {
            ...currentState.requests,
            [id]: {
                tool: toolName,
                arguments: input,
                createdAt: Date.now()
            }
        }
    }));

    // 发送推送通知
    this.session.api.push().sendToAllDevices(
        'Permission Request',
        `Claude wants to ${getToolName(toolName)}`
    );
}

// 2. Server 处理状态更新（packages/happy-server/sources/app/api/socket/sessionUpdateHandler.ts）
socket.on('update-state', async (data, callback) => {
    const { sid, agentState, expectedVersion } = data;

    // 乐观锁更新
    const { count } = await db.session.updateMany({
        where: { id: sid, agentStateVersion: expectedVersion },
        data: {
            agentState: agentState,
            agentStateVersion: expectedVersion + 1
        }
    });

    // 广播更新
    const updatePayload = buildUpdateSessionUpdate(sid, updSeq, randomKey, undefined, agentStateUpdate);
    eventRouter.emitUpdate({
        userId,
        payload: updatePayload,
        recipientFilter: { type: 'all-interested-in-session', sessionId: sid }
    });
});

// 3. App 接收更新（packages/happy-app/sources/sync/sync.ts）
this.socket.on('update', (data: Update) => {
    if (data.body.t === 'update-session') {
        if (data.body.agentState && data.body.agentState.version > this.agentStateVersion) {
            // 解密并更新本地状态
            this.agentState = decrypt(this.encryptionKey, decodeBase64(data.body.agentState.value));
            // UI 会读取 agentState.requests 显示权限请求
        }
    }
});
```

### 2.3 Mobile 响应权限请求

```typescript
// 文件：packages/happy-app/sources/sync/ops.ts
export async function sessionAllow(
    sessionId: string,
    id: string,
    mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan',
    allowedTools?: string[],
    decision?: 'approved' | 'approved_for_session'
) {
    const request = { id, approved: true, mode, allowTools: allowedTools, decision };
    await apiSocket.sessionRPC(sessionId, 'permission', request);
}

export async function sessionDeny(
    sessionId: string,
    id: string,
    mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan',
    allowedTools?: string[],
    decision?: 'denied' | 'abort'
) {
    const request = { id, approved: false, mode, allowTools: allowedTools, decision };
    await apiSocket.sessionRPC(sessionId, 'permission', request);
}
```

### 2.4 响应回传到 CLI

```
┌────────────────┐
│ 用户在 App 点击 │
│ Approve/Deny   │
└───────┬────────┘
        │
        ▼
┌────────────────────┐
│ sessionAllow/Deny  │ (ops.ts)
│ 调用 sessionRPC    │
└────────┬───────────┘
        │
        ▼
┌────────────────────┐
│ apiSocket.sessionRPC │ (apiSocket.ts)
│ 加密参数            │
│ method: "session:permission" │
│ params: encrypted   │
└────────┬───────────┘
        │
        ▼
┌────────────────────┐
│ Server rpcHandler  │ (rpcHandler.ts)
│ 找到目标 Socket    │
│ (CLI 连接)          │
└────────┬───────────┘
        │
        ▼
┌────────────────────┐
│ 转发到 CLI Socket  │
│ 'rpc-request' 事件 │
└────────┬───────────┘
        │
        ▼
┌────────────────────┐
│ CLI RpcHandlerManager │ (apiSession.ts)
│ 处理 'permission'  │
│ handler            │
└────────┬───────────┘
        │
        ▼
┌────────────────────┐
│ PermissionHandler  │ (permissionHandler.ts)
│ handlePermissionResponse │
│ 解析响应            │
└────────┬───────────┘
        │
        ▼
┌────────────────────┐
│ 更新 allowedTools  │
│ 或返回 deny        │
└────────┬───────────┘
        │
        ▼
┌────────────────────┐
│ resolve Promise    │
│ SDK 继续执行工具   │
└────────────────────┘
```

**RPC 机制的关键：**

```typescript
// Server 端 RPC 路由（packages/happy-server/sources/app/api/socket/rpcHandler.ts）
socket.on('rpc-call', async (data, callback) => {
    const { method, params } = data;
    // method 格式: "sessionId:permission"

    const targetSocket = rpcListeners.get(method);
    if (targetSocket) {
        const response = await targetSocket.timeout(30000).emitWithAck('rpc-request', {
            method,
            params
        });
        callback({ ok: true, result: response });
    }
});

// CLI 端 RPC 注册（packages/happy-cli/src/api/rpc/RpcHandlerManager.ts）
registerHandler<PermissionResponse, void>('permission', async (message) => {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
        this.handlePermissionResponse(message, pending);
    }
});
```

---

## 三、Claude CLI 集成方式

### 3.1 Local 模式的 Claude CLI 启动

```typescript
// 文件：packages/happy-cli/src/claude/claudeLocal.ts
export async function claudeLocal(opts) {
    // 1. 确定 session ID
    let startFrom = opts.sessionId;
    if (opts.claudeArgs?.includes('--continue')) {
        startFrom = claudeFindLastSession(opts.path);
    }

    // 2. 构建参数
    const args = [];
    if (startFrom) {
        args.push('--resume', startFrom);
    }
    args.push('--append-system-prompt', systemPrompt);
    if (opts.mcpServers) {
        args.push('--mcp-config', JSON.stringify({ mcpServers: opts.mcpServers }));
    }
    if (opts.hookSettingsPath) {
        args.push('--settings', opts.hookSettingsPath);
    }

    // 3. 通过 Launcher 启动
    const child = spawn('node', [claudeCliPath, ...args], {
        stdio: ['inherit', 'inherit', 'inherit', 'pipe'],
        cwd: opts.path,
        env: { ...process.env, ...opts.claudeEnvVars }
    });

    // 4. 监听 fd 3 获取 thinking 状态
    if (child.stdio[3]) {
        const rl = createInterface({ input: child.stdio[3] });
        rl.on('line', (line) => {
            const message = JSON.parse(line);
            if (message.type === 'fetch-start') {
                updateThinking(true);
            } else if (message.type === 'fetch-end') {
                updateThinking(false);
            }
        });
    }
}
```

**Launcher 的作用（`claude_local_launcher.cjs`）：**

```javascript
// 文件：packages/happy-cli/scripts/claude_local_launcher.cjs

// 1. 禁用自动更新
process.env.DISABLE_AUTOUPDATER = '1';

// 2. 拦截 fetch 以追踪 thinking 状态
const originalFetch = global.fetch;
global.fetch = function(...args) {
    const id = ++fetchCounter;
    writeMessage({ type: 'fetch-start', id, hostname, path });

    const fetchPromise = originalFetch(...args);
    fetchPromise.then(() => {
        writeMessage({ type: 'fetch-end', id });
    });

    return fetchPromise;
};

// 3. 导入真实的 Claude CLI
const { getClaudeCliPath, runClaudeCli } = require('./claude_version_utils.cjs');
runClaudeCli(getClaudeCliPath());
```

**关键点：**
- Local 模式直接使用全局安装的 Claude CLI
- Launcher 只是一个 wrapper，主要用于监听 thinking 状态
- 通过 `--settings` 传入 hook 配置以获取 session ID

### 3.2 Remote 模式的 Claude CLI 启动

```typescript
// 文件：packages/happy-cli/src/claude/claudeRemote.ts
export async function claudeRemote(opts) {
    // 1. 准备 SDK 配置
    const sdkOptions: QueryOptions = {
        cwd: opts.path,
        resume: startFrom ?? undefined,
        mcpServers: opts.mcpServers,
        permissionMode: mapToClaudeMode(initial.mode.permissionMode),
        model: initial.mode.model,
        allowedTools: initial.mode.allowedTools,
        canCallTool: (toolName, input, options) =>
            opts.canCallTool(toolName, input, mode, options),
        executable: opts.jsRuntime ?? 'node',
        pathToClaudeCodeExecutable: resolve(join(projectPath(), 'scripts', 'claude_remote_launcher.cjs')),
        settingsPath: opts.hookSettingsPath,
    };

    // 2. 创建消息流
    let messages = new PushableAsyncIterable<SDKUserMessage>();
    messages.push({
        type: 'user',
        message: { role: 'user', content: initial.message }
    });

    // 3. 启动 query
    const response = query({
        prompt: messages,
        options: sdkOptions
    });

    // 4. 监听 SDK 输出
    for await (const message of response) {
        if (message.type === 'system' && message.subtype === 'init') {
            opts.onSessionFound(message.session_id);
        }
        opts.onMessage(message);

        if (message.type === 'result') {
            const next = await opts.nextMessage();
            if (next) {
                messages.push({ type: 'user', message: { role: 'user', content: next.message } });
            } else {
                messages.end();
                return;
            }
        }
    }
}
```

**Remote Launcher（`claude_remote_launcher.cjs`）：**

```javascript
// 更简洁，只是包装 setTimeout
global.setTimeout = function(callback, delay, ...args) {
    return originalSetTimeout(callback, delay, ...args);
};

const { getClaudeCliPath, runClaudeCli } = require('./claude_version_utils.cjs');
runClaudeCli(getClaudeCliPath());
```

### 3.3 Query SDK 的真正作用

Query SDK 是 Happy 与 Claude CLI 通信的核心抽象层：

```typescript
// 文件：packages/happy-cli/src/claude/sdk/query.ts
export class Query implements AsyncIterableIterator<SDKMessage> {
    // 1. 管理 Claude 子进程
    constructor(
        private childStdin: Writable | null,
        private childStdout: NodeJS.ReadableStream,
        private processExitPromise: Promise<void>,
        canCallTool?: CanCallToolCallback
    ) {
        this.canCallTool = canCallTool;
        this.readMessages(); // 持续读取 stdout
        this.sdkMessages = this.readSdkMessages();
    }

    // 2. 读取 Claude 的 JSON 输出
    private async readMessages() {
        const rl = createInterface({ input: this.childStdout });
        for await (const line of rl) {
            const message = JSON.parse(line);

            if (message.type === 'control_request') {
                // Claude 请求权限
                await this.handleControlRequest(message);
            } else {
                // 正常消息（assistant、user、result等）
                this.inputStream.enqueue(message);
            }
        }
    }

    // 3. 处理权限请求（Control Request）
    private async handleControlRequest(request: CanUseToolControlRequest) {
        const response = await this.processControlRequest(request, controller.signal);

        // 通过 stdin 发送响应给 Claude
        const controlResponse = {
            type: 'control_response',
            response: {
                subtype: 'success',
                request_id: request.request_id,
                response
            }
        };
        this.childStdin.write(JSON.stringify(controlResponse) + '\n');
    }

    // 4. 调用 canCallTool 回调
    private async processControlRequest(request, signal) {
        if (request.request.subtype === 'can_use_tool') {
            return this.canCallTool(
                request.request.tool_name,
                request.request.input,
                { signal }
            );
        }
    }
}

// 5. 主函数：spawn Claude 并创建 Query
export function query(config: { prompt, options }) {
    // 构建命令参数
    const args = ['--output-format', 'stream-json', '--verbose'];
    if (canCallTool) {
        args.push('--permission-prompt-tool', 'stdio');
    }

    // Spawn Claude
    const child = spawn(spawnCommand, spawnArgs, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: config.options?.abort,
        env: spawnEnv
    });

    // 创建 Query 实例
    const query = new Query(childStdin, child.stdout, processExitPromise, canCallTool);
    return query;
}
```

**SDK 的核心价值：**

1. **抽象 stdio 通信**：将 Claude CLI 的 JSON 流转换为 TypeScript 类型
2. **权限控制**：实现 `canCallTool` 回调机制，允许外部控制工具调用
3. **进程管理**：处理子进程生命周期、abort 信号、错误处理
4. **异步迭代器**：提供优雅的异步消息流接口

---

## 四、消息流转机制

### 4.1 用户在 Mobile 发送消息的完整流程

```
┌─────────────────────────────────────────────────────────────┐
│                     Mobile 端发送消息                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │ 1. 用户输入文本                   │
         │    (ChatInput 组件)              │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 2. 加密消息内容                   │
         │    sessionEncryption.encryptRaw() │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 3. 通过 Socket 发送              │
         │    socket.emit('message', {      │
         │      sid: sessionId,             │
         │      message: encrypted          │
         │    })                            │
         └─────────────┬───────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                      Server 端处理                            │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 4. sessionUpdateHandler         │
         │    socket.on('message')         │
         │    • 验证 session 权限           │
         │    • 分配 seq 序号              │
         │    • 保存到数据库                │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 5. 广播更新事件                  │
         │    eventRouter.emitUpdate({     │
         │      payload: newMessageUpdate, │
         │      recipientFilter: {         │
         │        type: 'all-interested'   │
         │      }                          │
         │    })                          │
         └─────────────┬───────────────────┘
                       │
                       ├──────────────────────┬─────────────────┐
                       │                      │                 │
                       ▼                      ▼                 ▼
         ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
         │ CLI Socket       │   │ App Socket       │   │ Other App Socket │
         │ (session-scoped) │   │ (user-scoped)    │   │ (user-scoped)    │
         └──────┬───────────┘   └──────┬───────────┘   └──────┬───────────┘
                │                      │                      │
                ▼                      ▼                      ▼
┌───────────────────────────────────────────────────────────────────┐
│                      接收端处理                                     │
└────────────────────────┬──────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
  ┌────────────┐  ┌────────────┐  ┌────────────┐
  │ CLI 端     │  │ App 端     │  │ App 端     │
  │            │  │            │  │            │
  │ 6. 解密    │  │ 6. 解密    │  │ 6. 解密    │
  │ 7. 解析    │  │ 7. 解析    │  │ 7. 解析    │
  │ 8. 推入    │  │ 8. 更新    │  │ 8. 更新    │
  │   消息队列 │  │   UI       │  │   UI       │
  └────────────┘  └────────────┘  └────────────┘
```

**关键代码片段：**

```typescript
// Mobile 发送（packages/happy-app/sources/sync/sync.ts）
async sendMessage(sessionId: string, text: string) {
    const sessionEncryption = this.encryption.getSessionEncryption(sessionId);
    const content = {
        role: 'user',
        content: { type: 'text', text },
        meta: { sentFrom: 'app' }
    };
    const encrypted = encodeBase64(await sessionEncryption.encrypt(content));

    this.socket.emit('message', {
        sid: sessionId,
        message: encrypted
    });
}

// Server 接收（packages/happy-server/sources/app/api/socket/sessionUpdateHandler.ts）
socket.on('message', async (data) => {
    const { sid, message, localId } = data;

    // 创建加密消息记录
    const msgContent = { t: 'encrypted', c: message };
    const msg = await db.sessionMessage.create({
        data: {
            sessionId: sid,
            seq: msgSeq,
            content: msgContent,
            localId: useLocalId
        }
    });

    // 广播
    const updatePayload = buildNewMessageUpdate(msg, sid, updSeq, randomKey);
    eventRouter.emitUpdate({
        userId,
        payload: updatePayload,
        recipientFilter: { type: 'all-interested-in-session', sessionId: sid }
    });
});

// CLI 接收（packages/happy-cli/src/api/apiSession.ts）
this.socket.on('update', (data: Update) => {
    if (data.body.t === 'new-message') {
        const body = decrypt(this.encryptionKey, decodeBase64(data.body.message.content.c));
        const userResult = UserMessageSchema.safeParse(body);
        if (userResult.success) {
            this.pendingMessages.push(userResult.data);
        }
    }
});
```

### 4.2 Claude 输出如何传递到 Mobile

```
┌─────────────────────────────────────────────────────────────┐
│                    Claude 生成输出                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │ 1. Claude 输出 JSON Lines       │
         │    • assistant 消息              │
         │    • tool_use 块                │
         │    • thinking 文本              │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 2. SDK Query 解析流             │
         │    for await (message of query) │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 3. Remote Launcher 处理消息     │
         │    onMessage(message)           │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 4. Session Scanner 监听文件     │
         │    • 读取 session.jsonl         │
         │    • 解析每一行                 │
         │    • 过滤元数据                 │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 5. 发送到 Server               │
         │    session.client.sendClaudeSessionMessage() │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 6. ApiSessionClient 加密        │
         │    • 包装为 MessageContent      │
         │    • 加密                       │
         │    • socket.emit('message')    │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 7. Server 保存并广播            │
         │    (同前文消息流程)             │
         └─────────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ 8. Mobile 接收并解析            │
         │    • sync.ts 处理 update 事件   │
         │    • 解密消息                   │
         │    • 转换为 Message 类型        │
         │    • 更新 UI                    │
         └─────────────────────────────────┘
```

**Session Scanner 的工作原理：**

```typescript
// 文件：packages/happy-cli/src/claude/utils/sessionScanner.ts
export async function createSessionScanner(opts: {
    sessionId: string | null,
    workingDirectory: string,
    onMessage: (message: RawJSONLines) => void
}) {
    let currentSessionId = opts.sessionId;
    let tail: ChildProcess | null = null;

    const startTailing = async (sessionId: string) => {
        const sessionFile = join(projectDir, `${sessionId}.jsonl`);

        // 使用 tail -f 监听文件变化
        tail = spawn('tail', ['-f', '-n', '+1', sessionFile], {
            cwd: opts.workingDirectory,
            stdio: ['ignore', 'pipe', 'ignore']
        });

        const rl = createInterface({ input: tail.stdout });
        for await (const line of rl) {
            try {
                const msg = JSON.parse(line);

                // 过滤不需要的消息
                if (msg.isSidechain || msg.isMeta) continue;

                opts.onMessage(msg);
            } catch (e) {
                // 忽略解析错误
            }
        }
    };

    if (currentSessionId) {
        await startTailing(currentSessionId);
    }

    return {
        onNewSession: async (newSessionId: string) => {
            if (tail) tail.kill();
            currentSessionId = newSessionId;
            await startTailing(newSessionId);
        }
    };
}
```

### 4.3 Socket.io 通信协议

Happy 使用 Socket.io 实现实时双向通信，主要有三种连接类型：

```typescript
// 连接类型（packages/happy-server/sources/app/api/socket.ts）
type ClientConnection =
    | { connectionType: 'session-scoped'; socket: Socket; userId: string; sessionId: string }
    | { connectionType: 'machine-scoped'; socket: Socket; userId: string; machineId: string }
    | { connectionType: 'user-scoped'; socket: Socket; userId: string };
```

**主要事件类型：**

| 事件名 | 方向 | 用途 | 数据结构 |
|-------|------|------|---------|
| `message` | Client → Server | 发送消息 | `{ sid, message: encrypted }` |
| `update` | Server → Client | 广播更新 | `{ body: { t: 'new-message' \| 'update-session' } }` |
| `rpc-call` | Client → Server | RPC 调用 | `{ method, params }` |
| `rpc-request` | Server → Client | RPC 请求转发 | `{ method, params }` |
| `update-state` | Client → Server | 更新 AgentState | `{ sid, agentState, expectedVersion }` |
| `update-metadata` | Client → Server | 更新 Session Metadata | `{ sid, metadata, expectedVersion }` |
| `session-alive` | Client → Server | 心跳 | `{ sid, time, thinking }` |

### 4.4 RPC 机制

Happy 实现了一个完整的 RPC（Remote Procedure Call）系统：

**RPC 注册流程：**

```
┌──────────────┐
│ CLI 启动     │
└──────┬───────┘
       │
       ▼
┌────────────────────┐
│ RpcHandlerManager  │
│ 初始化             │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ 注册 handlers      │
│ • permission       │
│ • abort            │
│ • switch           │
│ ...                │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ socket.on('connect') │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ 发送 rpc-register  │
│ method 格式:       │
│ "sessionId:permission" │
└────────┬───────────┘
       │
       ▼
┌────────────────────┐
│ Server 记录映射    │
│ rpcListeners.set(  │
│   method, socket   │
│ )                  │
└────────────────────┘
```

---

## 五、状态同步机制

### 5.1 AgentState 的结构和作用

```typescript
// 文件：packages/happy-cli/src/api/types.ts
export interface AgentState {
    // 控制权标识
    controlledByUser?: boolean;  // true=local, false=remote

    // 权限请求队列（未处理的权限请求）
    requests?: {
        [requestId: string]: {
            tool: string;
            arguments: unknown;
            createdAt: number;
        };
    };

    // 已完成的权限请求
    completedRequests?: {
        [requestId: string]: {
            tool: string;
            arguments: unknown;
            createdAt: number;
            completedAt: number;
            status: 'approved' | 'denied' | 'canceled';
            reason?: string;
            mode?: string;
            allowTools?: string[];
        };
    };
}
```

### 5.2 Session 的同步机制（乐观锁）

```typescript
// CLI 端更新 AgentState（packages/happy-cli/src/api/apiSession.ts）
updateAgentState(handler: (metadata: AgentState) => AgentState) {
    this.agentStateLock.inLock(async () => {
        await backoff(async () => {
            // 1. 本地计算新状态
            let updated = handler(this.agentState || {});

            // 2. 发送到 server，带上期望的版本号
            const answer = await this.socket.emitWithAck('update-state', {
                sid: this.sessionId,
                expectedVersion: this.agentStateVersion,
                agentState: encodeBase64(encrypt(this.encryptionKey, updated))
            });

            // 3. 检查响应
            if (answer.result === 'success') {
                // 更新成功
                this.agentState = decrypt(decodeBase64(answer.agentState));
                this.agentStateVersion = answer.version;
            } else if (answer.result === 'version-mismatch') {
                // 版本冲突，重试
                this.agentStateVersion = answer.version;
                this.agentState = decrypt(decodeBase64(answer.agentState));
                throw new Error('Agent state version mismatch');
            }
        });
    });
}

// Server 端处理更新（packages/happy-server）
socket.on('update-state', async (data, callback) => {
    const { sid, agentState, expectedVersion } = data;

    // 使用数据库的乐观锁机制
    const { count } = await db.session.updateMany({
        where: {
            id: sid,
            agentStateVersion: expectedVersion  // 只有版本匹配才更新
        },
        data: {
            agentState: agentState,
            agentStateVersion: expectedVersion + 1
        }
    });

    if (count === 0) {
        // 版本冲突
        callback({
            result: 'version-mismatch',
            version: session.agentStateVersion,
            agentState: session.agentState
        });
    } else {
        // 更新成功，广播
        eventRouter.emitUpdate({ ... });
        callback({
            result: 'success',
            version: expectedVersion + 1,
            agentState: agentState
        });
    }
});
```

### 5.3 加密机制

Happy 使用 **端到端加密**：

```typescript
// 加密管理（packages/happy-app/sources/sync/encryption/encryption.ts）
export class SessionEncryption {
    constructor(
        private key: Uint8Array,
        private variant: 'legacy' | 'dataKey'
    ) {}

    async encrypt(data: any): Promise<Uint8Array> {
        const json = JSON.stringify(data);
        const plaintext = new TextEncoder().encode(json);

        if (this.variant === 'dataKey') {
            // 使用 AES-GCM
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const algorithm = { name: 'AES-GCM', iv };
            const cryptoKey = await crypto.subtle.importKey(
                'raw', this.key, algorithm, false, ['encrypt']
            );
            const ciphertext = await crypto.subtle.encrypt(
                algorithm, cryptoKey, plaintext
            );

            // 返回 iv + ciphertext
            return concatUint8Arrays(iv, new Uint8Array(ciphertext));
        }
    }
}
```

**加密数据流：**

```
┌──────────────┐                ┌──────────────┐                ┌──────────────┐
│ Client A     │                │ Server       │                │ Client B     │
│              │                │              │                │              │
│ plaintext    │   encrypted    │  encrypted   │   encrypted    │ plaintext    │
│ message      ├───────────────►│  storage     ├───────────────►│ message      │
│              │                │              │                │              │
│ encryptKey   │                │  (no key!)   │                │ encryptKey   │
└──────────────┘                └──────────────┘                └──────────────┘
```

---

## 六、与用户项目的对比

### 6.1 关键差异点

#### **1. Claude CLI 集成方式**

| 维度 | 用户项目 | Happy 项目 |
|-----|---------|-----------|
| **运行模式** | 单一模式 | Local/Remote 双模式 |
| **启动方式** | 直接 spawn claude | 通过 Launcher wrapper |
| **权限检测** | ？ | canCallTool 回调 |

**建议改进：**
```typescript
// 参考 Happy 的设计，添加模式切换
export type RunMode = 'local' | 'remote';

export async function spawnClaude(mode: RunMode, options) {
    if (mode === 'local') {
        return spawnInteractiveClaude(options);
    } else {
        return spawnManagedClaude(options);
    }
}
```

#### **2. 权限请求机制**

| 维度 | 用户项目 | Happy 项目 |
|-----|---------|-----------|
| **权限检测** | 字符串匹配？ | canCallTool SDK 回调 |
| **权限信息** | 只有文本？ | 工具名 + 结构化参数 |
| **权限粒度** | 粗粒度？ | 细粒度（按工具、命令前缀） |
| **权限模式** | 无？ | default/acceptEdits/bypassPermissions/plan |

**建议改进：**
```typescript
// 1. 实现 canCallTool 回调
const permissionHandler = new PermissionHandler();

query({
    prompt: messages,
    options: {
        canCallTool: async (toolName, input, { signal }) => {
            const response = await permissionHandler.requestPermission(
                toolName,
                input,
                signal
            );
            return response;
        }
    }
});

// 2. 使用 AgentState 管理权限状态
interface AgentState {
    pendingPermissions: Map<string, PermissionRequest>;
    approvedTools: Set<string>;
}
```

#### **3. Session Scanner vs 直接监听**

| 维度 | 用户项目 | Happy 项目 |
|-----|---------|-----------|
| **消息来源** | 直接监听 stdout？ | tail -f 监听 .jsonl 文件 |
| **可靠性** | 可能错过消息？ | 不会错过任何消息 |
| **Session 切换** | ？ | 支持动态切换 |

**建议改进：**
```typescript
// 类似 Happy 的 SessionScanner
export class ClaudeOutputMonitor {
    private tail: ChildProcess | null = null;

    async startMonitoring(sessionId: string) {
        const sessionFile = getSessionFile(sessionId);

        this.tail = spawn('tail', ['-f', '-n', '+1', sessionFile]);
        const rl = createInterface({ input: this.tail.stdout });

        for await (const line of rl) {
            const message = JSON.parse(line);
            this.handleMessage(message);
        }
    }
}
```

#### **4. RPC 机制**

| 维度 | 用户项目 | Happy 项目 |
|-----|---------|-----------|
| **通信方式** | 简单 WebSocket 消息？ | 完整 RPC 系统 |
| **客户端类型** | ？ | session-scoped/user-scoped/machine-scoped |
| **加密** | ？ | 加密的 RPC 参数和结果 |

**建议改进：**
```typescript
// 实现 RPC 系统
export class RpcManager {
    private handlers = new Map<string, Function>();

    registerHandler(method: string, handler: Function) {
        this.handlers.set(method, handler);
        this.socket.emit('rpc-register', { method });
    }

    async call(method: string, params: any): Promise<any> {
        const response = await this.socket.emitWithAck('rpc-call', {
            method,
            params
        });
        return response;
    }
}
```

#### **5. 加密机制**

| 维度 | 用户项目 | Happy 项目 |
|-----|---------|-----------|
| **加密方式** | 明文传输？TLS？ | 端到端加密（E2E） |
| **密钥管理** | ？ | Server 不知道密钥 |
| **加密算法** | ？ | AES-GCM |

**建议改进：**
```typescript
// 实现端到端加密
export class SessionEncryption {
    constructor(private key: Uint8Array) {}

    async encrypt(data: any): Promise<string> {
        const plaintext = JSON.stringify(data);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cryptoKey = await crypto.subtle.importKey(
            'raw', this.key, { name: 'AES-GCM', iv }, false, ['encrypt']
        );
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(plaintext)
        );
        return encodeBase64(concat(iv, ciphertext));
    }
}
```

#### **6. 状态同步**

| 维度 | 用户项目 | Happy 项目 |
|-----|---------|-----------|
| **版本控制** | 无？ | 乐观锁（版本号） |
| **并发处理** | 可能有冲突？ | 自动重试 |

**建议改进：**
```typescript
// 实现版本控制的状态更新
export class StateManager {
    private version = 0;
    private state: AgentState = {};

    async updateState(updater: (state: AgentState) => AgentState) {
        let retries = 0;
        while (retries < 3) {
            const newState = updater(this.state);

            const response = await this.socket.emitWithAck('update-state', {
                sessionId: this.sessionId,
                state: encrypted(newState),
                expectedVersion: this.version
            });

            if (response.result === 'success') {
                this.version = response.version;
                this.state = decrypt(response.state);
                return;
            } else {
                // 版本冲突，重试
                this.version = response.version;
                this.state = decrypt(response.state);
                retries++;
            }
        }
    }
}
```

### 6.2 架构对比图

```
用户项目 (当前)：
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│ Desktop     │◄────────►│ Server      │◄────────►│ Mobile      │
│ (spawn CLI) │ WebSocket│ (简单路由)   │ WebSocket│ (UI)        │
└─────────────┘          └─────────────┘          └─────────────┘
     │                          │                        │
     │ 可能缺少：                │ 可能缺少：              │ 可能缺少：
     │ • 模式切换                │ • RPC 系统             │ • 权限审批
     │ • Session Scanner        │ • 加密                 │ • 状态同步
     │ • 权限管理                │ • 状态版本控制         │
     └──────────────────────────┴────────────────────────┘

Happy 项目 (参考)：
┌─────────────┐          ┌─────────────┐          ┌─────────────┐
│ Happy CLI   │◄────────►│ Happy Server│◄────────►│ Happy App   │
│             │ Socket.io│             │ Socket.io│             │
│ • Local Mode│          │ • RPC 路由   │          │ • 权限审批   │
│ • Remote Mode│         │ • 加密存储   │          │ • 实时同步   │
│ • Session   │          │ • 版本控制   │          │ • 多设备    │
│   Scanner   │          │ • EventRouter│          │             │
│ • Permission│          │             │          │             │
│   Handler   │          │             │          │             │
└─────────────┘          └─────────────┘          └─────────────┘
     │                          │                        │
     ├──────────────────────────┼────────────────────────┤
     │         完整的端到端加密 + RPC + 状态同步         │
     └──────────────────────────────────────────────────┘
```

---

## 七、总结

### 7.1 Happy 项目的核心优势

1. **清晰的模式分离**：Local 和 Remote 模式有明确的职责和切换机制
2. **完整的权限流程**：从请求产生、传递、审批到回传的完整链路
3. **可靠的消息同步**：Session Scanner + 乐观锁 + 加密
4. **灵活的 RPC 系统**：支持多种客户端类型和方法调用
5. **端到端加密**：保护用户隐私，Server 无法读取消息内容

### 7.2 关键技术点

- **Claude CLI 集成**：通过 Launcher wrapper 和 SDK query
- **权限管理**：`canCallTool` 回调 + AgentState
- **消息流转**：Socket.io + EventRouter + 加密
- **状态同步**：版本号 + 乐观锁 + 自动重试
- **RPC 通信**：注册 + 路由 + 加密参数

### 7.3 推荐的改进优先级

#### **高优先级：**

1. **实现完整的权限请求流程**
   - 使用 `canCallTool` 回调
   - 通过 WebSocket 发送权限请求到 Mobile
   - 使用 RPC 机制回传审批结果

2. **添加 Local/Remote 模式切换**
   - Local 模式：终端交互（开发调试）
   - Remote 模式：Mobile 远程控制（生产使用）

3. **实现 RPC 系统**
   - 统一的 RPC 注册和调用机制
   - 支持加密的 RPC 参数

#### **中优先级：**

4. **实现端到端加密**
   - 每个 session 独立密钥
   - Server 不存储明文数据

5. **添加状态同步机制**
   - 使用版本号防止并发冲突
   - 实现 AgentState 管理

6. **实现 Session Scanner**
   - 监听 `.jsonl` 文件而不是 stdout
   - 支持 session 切换

#### **低优先级：**

7. **优化消息队列**
8. **添加 Hook Server**
9. **实现多客户端支持**

---

**调研完成时间**：2026-02-06
**文档版本**：v1.0
