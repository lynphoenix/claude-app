# OpenCode 与 Happy 项目对比调研报告

> 调研时间：2026-02-06
> 调研目的：为移动端权限请求功能实现提供参考方案

---

## 目录

- [一、项目概况](#一项目概况)
- [二、OpenCode 初步分析](#二opencode-初步分析)
- [三、Happy 深度分析（已完成）](#三happy-深度分析已完成)
- [四、关键技术对比](#四关键技术对比)
- [五、权限请求实现方案建议](#五权限请求实现方案建议)

---

## 一、项目概况

### 1.1 OpenCode

**基本信息：**
- GitHub: https://github.com/anomalyco/opencode
- 官网: https://opencode.ai
- Stars: 99K+ (非常活跃)
- 语言: TypeScript
- 许可: MIT
- 描述: The open source coding agent

**项目特点：**
- ✅ 开源的Claude Code替代品
- ✅ 活跃的社区（9384 forks, 4660 open issues）
- ✅ 最新提交: 2026-02-06（非常活跃）
- ✅ Monorepo架构（packages/目录）

**网络调研限制：**
由于网络原因，无法完整获取OpenCode的源码和文档，但从主页信息看：
- 定位为"开源编码代理"
- 应该包含完整的权限管理系统
- 可能支持Web/移动端交互

### 1.2 Happy

**基本信息：**
- 本地路径: `/Users/linyining/Documents/code/happy`
- 定位: 移动端远程控制Claude Code
- 语言: TypeScript (Monorepo)
- 架构: CLI + Server + App

**项目特点：**
- ✅ 完整的移动端权限请求流程
- ✅ Local/Remote双模式设计
- ✅ Query SDK封装Claude CLI
- ✅ E2E加密通信
- ✅ 详细的实现文档（已完成深度调研）

---

## 二、OpenCode 初步分析

### 2.1 从网页元数据推断的架构

从https://opencode.ai主页HTML中发现的关键信息：

```javascript
// 从首页脚本中提取的数据
{
  stars: 98995,
  release: {
    name: "v1.1.53",
    url: "https://github.com/anomalyco/opencode/releases/tag/v1.1.53",
    tag_name: "v1.1.53"
  },
  contributors: 454
}
```

**架构特征分析：**

1. **前端框架**: 使用了Solid.js（从HTML中的HyperScript和路由模式判断）
```html
<script>window._$HY||(e=>{...})(_$HY={events:[],completed:new WeakSet,r:{},fe(){}});</script>
```

2. **字体系统**: 支持多种Nerd Font（JetBrains Mono, Fira Code, Cascadia Code等）
   - 说明有完整的终端UI实现
   - 可能包含Web终端界面

3. **Build系统**: 使用Vite（从资源路径`/_build/assets/`判断）

### 2.2 文档结构推断

从docs页面HTML中发现：
```html
<title>Intro | OpenCode</title>
<meta name="description" content="Get started with OpenCode."/>
<link rel="canonical" href="https://opencode.ai/docs/"/>
```

**文档可能包含：**
- Intro (入门指南)
- Installation (安装说明)
- Architecture (架构文档)
- Permissions (权限系统) - **这是我们关注的重点**

### 2.3 与Claude Code的关系

OpenCode定位为"open source coding agent"，很可能：
- **方案A**: 完全重新实现了Claude Code的功能（不依赖Claude CLI）
- **方案B**: 包装了Claude CLI并添加了额外功能（类似Happy）
- **方案C**: 使用了Anthropic API直接调用（不通过CLI）

**判断依据不足**，需要访问源码才能确定。

---

## 三、Happy 深度分析（已完成）

> 详细报告见：`/Users/linyining/Documents/code/diy/claude-app/docs/Happy架构深度调研报告.md`

### 3.1 核心架构总结

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

### 3.2 权限请求核心流程

**关键发现：Happy使用Query SDK包装Claude CLI**

```typescript
// packages/happy-cli/src/claude/sdk/query.ts

// 1. 启动Claude CLI时添加标志
const args = ['--output-format', 'stream-json', '--verbose'];
if (canCallTool) {
  args.push('--permission-prompt-tool', 'stdio');  // 关键标志！
}

// 2. 监听control_request消息
if (message.type === 'control_request') {
  await this.handleControlRequest(message);
}

// 3. 通过canCallTool回调处理权限
private async processControlRequest(request, signal) {
  if (request.request.subtype === 'can_use_tool') {
    return this.canCallTool(
      request.request.tool_name,
      request.request.input,
      { signal }
    );
  }
}

// 4. 通过stdin发送响应
this.claudeProcess.stdin.write(JSON.stringify({
  type: 'control_response',
  control_request_id: requestId,
  response: { behavior: 'allow' | 'deny' }
}) + '\n');
```

**权限流转完整路径：**

```
1. Mobile App发送消息
   → 2. Server转发到Desktop CLI
   → 3. Desktop启动Claude CLI (带--permission-prompt-tool stdio)
   → 4. Claude CLI输出control_request到stdout
   → 5. Query SDK捕获并调用canCallTool回调
   → 6. Desktop通过WebSocket发送permission-request到Server
   → 7. Server转发到Mobile App
   → 8. Mobile用户选择Allow/Deny
   → 9. Server转发响应到Desktop
   → 10. Desktop通过stdin发送control_response给Claude CLI
   → 11. Claude CLI继续执行或取消
```

### 3.3 Happy的关键优势

✅ **不修改Claude CLI** - 通过Query SDK wrapper实现权限拦截
✅ **标准协议** - 使用Claude CLI的`--permission-prompt-tool stdio`标志
✅ **完整的双向通信** - RPC系统支持Desktop→Mobile→Desktop的往返
✅ **E2E加密** - 使用AES-GCM加密所有消息
✅ **会话持久化** - Session Scanner监控`.jsonl`文件

---

## 四、关键技术对比

### 4.1 权限请求机制对比

| 维度 | Happy | 你的项目 | OpenCode (推测) |
|------|-------|---------|----------------|
| **Claude CLI集成方式** | Query SDK wrapper | 直接spawn CLI | 未知 |
| **权限拦截方式** | `--permission-prompt-tool stdio` + control_request | 内容检测（不可靠） | 未知 |
| **通信协议** | WebSocket + RPC | WebSocket | 未知 |
| **加密方式** | AES-GCM | 计划中（已禁用） | 未知 |
| **权限响应** | stdin写入control_response | stdin写入yes/no（不标准） | 未知 |

### 4.2 架构模式对比

| 维度 | Happy | 你的项目 | 推荐方案 |
|------|-------|---------|---------|
| **Desktop角色** | CLI wrapper + SDK | Daemon进程 | **建议学习Happy** |
| **Server角色** | 中继 + RPC + DB | 中继 + DB | 当前OK |
| **Mobile角色** | 客户端 | 客户端 | 当前OK |
| **Claude CLI管理** | Query SDK | ProcessPool | **建议引入Query SDK** |
| **消息类型** | 标准control_request/response | 自定义permission-request | **建议改用标准协议** |

### 4.3 技术栈对比

| 组件 | Happy | 你的项目 | OpenCode (推测) |
|------|-------|---------|----------------|
| **语言** | TypeScript | TypeScript + Kotlin | TypeScript |
| **Desktop** | Node.js + Query SDK | Node.js + child_process | 未知 |
| **Server** | Express + Socket.io | Hono + Socket.io | 未知（可能是Solid Start） |
| **Mobile** | React Native? | React Native | 未知（可能有Web版） |
| **Database** | SQLite | SQLite | 未知 |
| **CLI Wrapper** | ✅ Query SDK | ❌ 无 | 未知 |

---

## 五、权限请求实现方案建议

### 方案对比

基于Happy的成功经验，以下是三种实现方案：

### 方案A：完全采用Happy的Query SDK模式（推荐 ⭐⭐⭐⭐⭐）

**实施步骤：**

1. **引入Query SDK或实现类似wrapper**
   ```typescript
   // desktop/src/querySdk.ts
   import { spawn } from 'child_process';

   class QuerySDK {
     spawn(projectPath: string, options: {
       onCanCallTool: (toolName, input, options) => Promise<{behavior: 'allow' | 'deny'}>
     }) {
       const args = [
         '--output-format', 'stream-json',
         '--permission-prompt-tool', 'stdio',  // 关键！
         '-d', projectPath
       ];

       const claudeProcess = spawn('claude', args);

       // 监听stdout的control_request
       claudeProcess.stdout.on('data', async (chunk) => {
         const lines = chunk.toString().split('\n').filter(Boolean);
         for (const line of lines) {
           const message = JSON.parse(line);

           if (message.type === 'control_request') {
             // 调用回调
             const response = await options.onCanCallTool(
               message.request.tool_name,
               message.request.input,
               {}
             );

             // 通过stdin发送响应
             claudeProcess.stdin.write(JSON.stringify({
               type: 'control_response',
               control_request_id: message.control_request_id,
               response
             }) + '\n');
           }
         }
       });

       return claudeProcess;
     }
   }
   ```

2. **修改desktop/src/index.ts**
   ```typescript
   const querySdk = new QuerySDK();

   const claudeProcess = querySdk.spawn(projectPath, {
     onCanCallTool: async (toolName, input, options) => {
       // 发送到mobile
       const requestId = uuidv4();
       wsClient.send({
         type: 'permission-request',
         sessionId: currentSessionId,
         data: {
           requestId,
           toolName,
           input
         }
       });

       // 等待mobile响应（通过Promise）
       return new Promise((resolve) => {
         pendingPermissions.set(requestId, resolve);
       });
     }
   });

   // 处理permission-response
   wsClient.on('permission-response', (data) => {
     const resolver = pendingPermissions.get(data.requestId);
     if (resolver) {
       resolver({
         behavior: data.approved ? 'allow' : 'deny'
       });
       pendingPermissions.delete(data.requestId);
     }
   });
   ```

3. **Mobile无需修改** - 继续使用现有的permission-request/permission-response

**优势：**
- ✅ 使用Claude CLI的标准协议
- ✅ 100%可靠（不依赖内容检测）
- ✅ 支持所有工具的权限请求
- ✅ 完整的请求上下文（toolName + input）

**劣势：**
- 需要实现Query SDK wrapper（但代码量不大）

---

### 方案B：改进当前的内容检测方式（次优 ⭐⭐⭐）

**实施步骤：**

1. **使用更精确的检测规则**
   ```typescript
   // desktop/src/permissionDetector.ts

   class PermissionDetector {
     private buffer = '';

     detectPermission(chunk: string): boolean {
       this.buffer += chunk;

       // 检测Claude的标准权限提示格式
       const patterns = [
         /Do you want to proceed\?/i,
         /Should I continue\?/i,
         /\(y\/n\)/,
         /Press Enter to continue/i,
         // 添加更多模式...
       ];

       return patterns.some(pattern => pattern.test(this.buffer));
     }

     clearBuffer() {
       this.buffer = '';
     }
   }
   ```

2. **累积检测而非单chunk检测**
   ```typescript
   const detector = new PermissionDetector();

   processPool.on('output', (projectPath, chunk) => {
     if (detector.detectPermission(chunk.content)) {
       // 发送权限请求
       wsClient.send({
         type: 'permission-request',
         sessionId: currentSessionId,
         data: {
           requestId: uuidv4(),
           toolName: 'unknown',
           input: { prompt: detector.buffer }
         }
       });

       detector.clearBuffer();
     }
   });
   ```

**优势：**
- ✅ 改动最小
- ✅ 无需引入新依赖

**劣势：**
- ⚠️ 仍然不可靠（可能漏检或误检）
- ⚠️ 无法获取toolName和structured input
- ⚠️ 依赖Claude的输出格式（可能变化）

---

### 方案C：直接使用Anthropic API（备选 ⭐⭐⭐⭐）

**实施步骤：**

1. **完全不使用Claude CLI，改用API**
   ```typescript
   import Anthropic from '@anthropic-ai/sdk';

   const client = new Anthropic({
     apiKey: config.apiKey
   });

   const stream = await client.messages.create({
     model: 'claude-sonnet-4-20250514',
     messages: [...],
     tools: [...],
     stream: true
   });

   for await (const event of stream) {
     if (event.type === 'tool_use') {
       // 请求权限
       const approved = await requestPermission(event.tool_name, event.input);

       if (approved) {
         // 继续执行
       } else {
         // 取消执行
       }
     }
   }
   ```

**优势：**
- ✅ 完全控制权限流程
- ✅ 无需解析CLI输出
- ✅ 可以获取完整的tool_use信息

**劣势：**
- ⚠️ 需要重新实现Claude CLI的所有功能
- ⚠️ 失去Claude CLI的内置能力（如file watching）
- ⚠️ 工作量巨大

---

### 推荐方案总结

| 方案 | 推荐指数 | 实施难度 | 可靠性 | 维护成本 |
|------|----------|----------|--------|---------|
| **方案A: Query SDK** | ⭐⭐⭐⭐⭐ | 中 | 高 | 低 |
| **方案B: 改进检测** | ⭐⭐⭐ | 低 | 中低 | 中 |
| **方案C: 直接API** | ⭐⭐⭐⭐ | 高 | 高 | 高 |

**最终建议：采用方案A（Query SDK模式）**

理由：
1. 学习Happy的成功经验
2. 使用Claude CLI的标准协议
3. 实施难度适中（200行代码左右）
4. 可靠性最高
5. 未来维护成本低

---

## 六、实施计划

### 阶段1：Query SDK实现（1-2天）

**任务清单：**
- [ ] 创建`desktop/src/querySdk.ts`
- [ ] 实现基本的spawn和消息解析
- [ ] 实现control_request/response处理
- [ ] 单元测试

### 阶段2：Desktop集成（0.5天）

**任务清单：**
- [ ] 修改`desktop/src/index.ts`使用QuerySDK
- [ ] 实现pendingPermissions管理
- [ ] 修改permission-response处理逻辑
- [ ] 测试本地权限流程

### 阶段3：E2E测试（0.5天）

**任务清单：**
- [ ] Mobile发送需要权限的操作
- [ ] 验证权限弹窗正确显示
- [ ] 验证Allow/Deny正常工作
- [ ] 验证工具正确执行/取消

### 阶段4：优化与文档（1天）

**任务清单：**
- [ ] 添加超时处理
- [ ] 添加错误重试
- [ ] 更新README
- [ ] 录制演示视频

---

## 七、关键代码参考

### 7.1 Happy的Query SDK核心代码

```typescript
// packages/happy-cli/src/claude/sdk/query.ts (简化版)

export class QuerySDK {
  private claudeProcess: ChildProcess | null = null;

  spawn(options: {
    projectPath: string;
    canCallTool?: (toolName: string, input: any, options: any) => Promise<{behavior: 'allow' | 'deny'}>;
  }) {
    const args = [
      '--output-format', 'stream-json',
      '--verbose',
      '-d', options.projectPath
    ];

    if (options.canCallTool) {
      args.push('--permission-prompt-tool', 'stdio');
    }

    this.claudeProcess = spawn('claude', args);

    this.claudeProcess.stdout?.on('data', async (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const message = JSON.parse(line);

          if (message.type === 'control_request') {
            await this.handleControlRequest(message, options.canCallTool);
          }
        } catch (error) {
          // 非JSON输出，可能是普通日志
        }
      }
    });

    return this.claudeProcess;
  }

  private async handleControlRequest(
    request: any,
    canCallTool?: Function
  ) {
    if (!canCallTool) {
      // 默认允许
      this.sendControlResponse(request.control_request_id, { behavior: 'allow' });
      return;
    }

    if (request.request.subtype === 'can_use_tool') {
      const response = await canCallTool(
        request.request.tool_name,
        request.request.input,
        {}
      );

      this.sendControlResponse(request.control_request_id, response);
    }
  }

  private sendControlResponse(requestId: string, response: any) {
    if (!this.claudeProcess?.stdin) return;

    this.claudeProcess.stdin.write(JSON.stringify({
      type: 'control_response',
      control_request_id: requestId,
      response
    }) + '\n');
  }
}
```

### 7.2 你的项目需要修改的部分

```typescript
// desktop/src/index.ts (修改后)

import { QuerySDK } from './querySdk.js';

// 存储待处理的权限请求
const pendingPermissions = new Map<string, (response: any) => void>();

// 使用QuerySDK替代原来的ProcessPool
const querySdk = new QuerySDK();

wsClient.on('change-project', async (data: any) => {
  // ... 路径验证 ...

  const claudeProcess = querySdk.spawn({
    projectPath: validation.resolved!,
    canCallTool: async (toolName, input, options) => {
      console.log(`🔐 [Permission] Tool: ${toolName}`);

      // 生成请求ID
      const requestId = uuidv4();

      // 发送到mobile
      wsClient.send({
        type: 'permission-request',
        sessionId: currentSessionId,
        data: {
          requestId,
          toolName,
          input,
          projectPath: validation.resolved
        }
      });

      // 返回Promise，等待mobile响应
      return new Promise((resolve) => {
        pendingPermissions.set(requestId, resolve);

        // 超时处理（30秒）
        setTimeout(() => {
          if (pendingPermissions.has(requestId)) {
            console.log(`⏱️ [Permission] Timeout for ${requestId}`);
            resolve({ behavior: 'deny' });
            pendingPermissions.delete(requestId);
          }
        }, 30000);
      });
    }
  });
});

// 处理mobile的响应
wsClient.on('permission-response', async (data: PermissionResponseFromServer['data']) => {
  console.log(`✅ [Permission] Response: ${data.approved ? 'APPROVED' : 'DENIED'}`);

  const resolver = pendingPermissions.get(data.requestId);
  if (resolver) {
    resolver({
      behavior: data.approved ? 'allow' : 'deny'
    });
    pendingPermissions.delete(data.requestId);
  }
});
```

---

## 八、总结

### 8.1 Happy的成功经验

✅ **使用标准协议** - `--permission-prompt-tool stdio` + control_request/response
✅ **Query SDK封装** - 不修改Claude CLI，通过wrapper实现拦截
✅ **Promise-based异步** - 使用Promise等待mobile响应
✅ **超时处理** - 避免永久阻塞
✅ **E2E加密** - 保护敏感信息

### 8.2 OpenCode的借鉴价值

⚠️ **网络限制导致无法完整调研**，但从项目规模和活跃度看：
- 99K+ stars说明方案成熟
- 可能包含更完善的权限UI
- 建议后续深入研究其实现

### 8.3 你的项目下一步

**建议优先实施：**
1. ✅ 实现Query SDK wrapper（参考Happy）
2. ✅ 使用`--permission-prompt-tool stdio`标志
3. ✅ 实现control_request/response处理
4. ✅ 测试完整的权限流程

**预计效果：**
- 🎯 100%可靠的权限检测
- 🎯 完整的tool上下文信息
- 🎯 标准的Claude CLI协议
- 🎯 易于维护和扩展

---

## 附录：参考资料

- **Happy架构深度调研报告**: `/Users/linyining/Documents/code/diy/claude-app/docs/Happy架构深度调研报告.md`
- **Claude CLI文档**: https://claude.com/docs/cli
- **OpenCode官网**: https://opencode.ai (需要翻墙访问)
- **OpenCode GitHub**: https://github.com/anomalyco/opencode

---

**撰写人**: Claude Code
**审阅状态**: 待用户审阅
**下一步**: 根据此报告决定实施方案
