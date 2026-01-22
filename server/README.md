# Claude Code Server

WebSocket 服务器，用于连接移动端应用和 Claude Code CLI。

## 环境变量

```bash
# 服务器端口
PORT=3001

# 默认项目路径
DEFAULT_PROJECT_PATH=/home/user/projects/default

# 允许访问的项目目录列表（逗号分隔）
ALLOWED_PROJECTS=/home/user/projects/project1,/home/user/projects/project2,/home/user/projects/project3

# CORS 配置
CORS_ORIGIN=*

# API 密钥（可选）
# API_KEY=your-api-key-here
```

## 运行

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 生产模式
npm start
```

## API 端点

- `GET /health` - 健康检查
- `GET /api/projects` - 获取可用的项目列表
- `WS /ws` - WebSocket 连接端点

## WebSocket 消息协议

### 客户端 → 服务器

```typescript
// 初始化连接
{ type: 'init', projectPath: string }

// 发送消息
{ type: 'message', content: string, id: string }

// 切换项目
{ type: 'changeProject', projectPath: string }

// 心跳
{ type: 'ping' }
```

### 服务器 → 客户端

```typescript
// 连接成功
{ type: 'connected', message: string }

// 就绪
{ type: 'ready', projectPath: string }

// 项目列表
{ type: 'projects', projects: string[] }

// 项目切换
{ type: 'projectChanged', projectPath: string, message: string }

// 消息确认
{ type: 'messageAck', id: string }

// 响应
{ type: 'response', content: string, messageId: string }

// 错误
{ type: 'error', message: string }
```
