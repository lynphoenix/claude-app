import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { ClaudeHandler } from './claudeHandler';

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

// 获取可用的项目目录列表
app.get('/api/projects', (req, res) => {
  const projects = process.env.ALLOWED_PROJECTS?.split(',') || [];
  res.json({ projects });
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
          const projectPath = message.projectPath || process.env.DEFAULT_PROJECT_PATH;
          const handler = new ClaudeHandler(projectPath);

          // 发送可用的项目列表
          const projects = process.env.ALLOWED_PROJECTS?.split(',') || [];
          ws.send(JSON.stringify({
            type: 'projects',
            projects: projects
          }));

          clients.set(ws, handler);
          ws.send(JSON.stringify({
            type: 'ready',
            projectPath
          }));
          break;

        case 'changeProject':
          // 切换项目目录
          const newHandler = new ClaudeHandler(message.projectPath);
          clients.set(ws, newHandler);
          ws.send(JSON.stringify({
            type: 'projectChanged',
            projectPath: message.projectPath,
            message: `已切换到项目: ${message.projectPath}`
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

          // 异步处理 Claude 响应
          currentHandler.sendMessage(message.content, (response) => {
            ws.send(JSON.stringify({
              type: 'response',
              content: response,
              messageId: message.id
            }));
          }, (error) => {
            ws.send(JSON.stringify({
              type: 'error',
              message: error
            }));
          });
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
