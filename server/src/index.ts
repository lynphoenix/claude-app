import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ClaudeHandler } from './claudeHandler.js';

dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取可用的项目目录列表（扫描 /home/ecs-user/code）
app.get('/api/projects', (req, res) => {
  try {
    const codeDir = '/home/ecs-user/code';

    if (!fs.existsSync(codeDir)) {
      fs.mkdirSync(codeDir, { recursive: true });
    }

    const entries = fs.readdirSync(codeDir, { withFileTypes: true });
    const projects = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(codeDir, entry.name));

    res.json({ projects });
  } catch (error) {
    console.error('读取项目列表失败:', error);
    res.status(500).json({ error: '读取项目列表失败' });
  }
});

// 创建新项目
app.post('/api/projects', express.json(), (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '项目名称不能为空' });
    }

    const codeDir = '/home/ecs-user/code';
    const projectPath = path.join(codeDir, name);

    if (fs.existsSync(projectPath)) {
      return res.status(400).json({ error: '项目已存在' });
    }

    fs.mkdirSync(projectPath, { recursive: true });
    res.json({ success: true, path: projectPath });
  } catch (error) {
    console.error('创建项目失败:', error);
    res.status(500).json({ error: '创建项目失败' });
  }
});

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server, path: '/ws' });

// 存储客户端连接
const clients = new Map<WebSocket, ClaudeHandler>();

wss.on('connection', (ws: WebSocket) => {
  console.log('新客户端连接');

  // 发送欢迎消息
  ws.send(JSON.stringify({
    type: 'connected',
    message: '已连接到 Claude Code 服务器'
  }));

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('收到消息:', message.type);

      switch (message.type) {
        case 'init':
          // 初始化 Claude 处理器
          // 默认使用 /home/ecs-user/code 作为"管家"目录
          const defaultPath = '/home/ecs-user/code';
          const projectPath = message.projectPath || defaultPath;
          const handler = new ClaudeHandler(projectPath);

          // 发送可用的项目列表
          const codeDir = '/home/ecs-user/code';

          if (!fs.existsSync(codeDir)) {
            fs.mkdirSync(codeDir, { recursive: true });
          }

          const entries = fs.readdirSync(codeDir, { withFileTypes: true });
          const projects = entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => path.join(codeDir, entry.name));

          ws.send(JSON.stringify({
            type: 'projects',
            projects: projects
          }));

          clients.set(ws, handler);

          // 获取并发送最近 20 条 session 历史
          const history = await handler.getSessionHistory(20, 0);

          ws.send(JSON.stringify({
            type: 'ready',
            projectPath,
            sessionId: handler.getSessionId(),
            history: history.messages,
            hasMoreHistory: history.hasMore,
            totalMessages: history.total
          }));
          break;

        case 'changeProject':
          // 切换项目目录
          const newHandler = new ClaudeHandler(message.projectPath);
          clients.set(ws, newHandler);

          // 获取新项目的最近 20 条 session 历史
          const newHistory = await newHandler.getSessionHistory(20, 0);

          ws.send(JSON.stringify({
            type: 'projectChanged',
            projectPath: message.projectPath,
            message: `已切换到项目: ${message.projectPath}`,
            history: newHistory.messages,
            hasMoreHistory: newHistory.hasMore,
            totalMessages: newHistory.total
          }));
          break;

        case 'loadMoreHistory':
          // 加载更多历史消息
          const loadHandler = clients.get(ws);
          if (!loadHandler) {
            ws.send(JSON.stringify({
              type: 'error',
              message: '请先初始化连接'
            }));
            break;
          }

          const offset = message.offset || 0;
          const limit = message.limit || 20;
          const moreHistory = await loadHandler.getSessionHistory(limit, offset);

          ws.send(JSON.stringify({
            type: 'historyLoaded',
            history: moreHistory.messages,
            hasMore: moreHistory.hasMore,
            offset: offset,
            total: moreHistory.total
          }));
          break;

        case 'message':
          // 处理用户消息
          const currentHandler = clients.get(ws);
          if (!currentHandler) {
            ws.send(JSON.stringify({
              type: 'error',
              message: '请先初始化连接'
            }));
            break;
          }

          // 发送用户消息确认
          ws.send(JSON.stringify({
            type: 'messageAck',
            id: message.id
          }));

          // 流式处理 Claude 响应
          let fullResponse = '';
          currentHandler.sendMessage(
            message.content,
            // 流式输出回调
            (chunk) => {
              fullResponse += chunk;
              ws.send(JSON.stringify({
                type: 'responseChunk',
                content: chunk,
                messageId: message.id
              }));
            },
            // 完成回调
            () => {
              // 发送完整响应（兼容旧客户端）
              ws.send(JSON.stringify({
                type: 'response',
                content: fullResponse,
                messageId: message.id
              }));

              // 发送完成标志（新客户端）
              ws.send(JSON.stringify({
                type: 'responseDone',
                messageId: message.id
              }));
            },
            // 错误回调
            (error) => {
              ws.send(JSON.stringify({
                type: 'error',
                message: error
              }));
            }
          );
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: '未知的消息类型'
          }));
      }
    } catch (error) {
      console.error('处理消息时出错:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: '处理消息时出错'
      }));
    }
  });

  ws.on('close', () => {
    console.log('客户端断开连接');
    const handler = clients.get(ws);
    if (handler) {
      handler.dispose();
      clients.delete(ws);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket 错误:', error);
  });
});

server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`WebSocket 端点: ws://localhost:${PORT}/ws`);
  console.log(`默认项目路径: ${process.env.DEFAULT_PROJECT_PATH}`);
});
