# Claude Code Mobile - 完整实现方案部署指南

## 📋 概述

已完成从"服务器执行模式"到"桌面执行模式"的架构改造：

```
旧架构： 手机 → 服务器(219) → 运行 Claude → 返回结果
新架构： 手机 → 服务器(中转) → 桌面客户端 → 运行 Claude → 返回结果
```

## ✅ 已实现功能

### 1. Desktop Client（桌面客户端）
- ✅ ACP协议支持（stream-json）
- ✅ Claude CLI进程管理
- ✅ WebSocket通信
- ✅ 权限请求转发
- ✅ 会话历史同步
- ✅ E2E加密支持
- ✅ 自动重连机制

**位置**: `desktop/`

### 2. Server（消息路由器）
- ✅ 设备管理（mobile + desktop）
- ✅ 消息路由
- ✅ 会话状态管理
- ✅ 设备切换支持
- ✅ 心跳检测
- ✅ 自动清理不活跃设备

**位置**: `server/`

### 3. 数据库支持
- ✅ PostgreSQL schema
- ✅ 会话表（sessions）
- ✅ 消息表（messages）
- ✅ 加密消息存储

## 🚀 部署步骤

### Step 1: 部署Desktop Client（在本地电脑）

```bash
cd desktop

# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env:
#   SERVER_URL=ws://47.99.75.219:3001/ws
#   DEVICE_ID=desktop-macbook
#   DB_HOST=47.99.75.219
#   DB_PORT=5432
#   DB_NAME=claude_mobile
#   DB_USER=postgres
#   DB_PASSWORD=your_password

# 3. 确保Claude CLI已安装
which claude
# 如果没有，安装: https://claude.ai/download

# 4. 启动客户端
npm start

# 或开发模式（自动重启）：
npm run dev
```

### Step 2: 部署Server（在219服务器）

```bash
# SSH到219服务器
ssh ecs-user@47.99.75.219

cd /path/to/claude-app/server

# 1. 安装依赖
npm install

# 2. 编译TypeScript
npm run build

# 3. 配置环境变量（如需要）
cp .env.example .env

# 4. 使用PM2管理进程
pm2 start dist/index.js --name claude-router

# 或直接运行：
npm start
```

### Step 3: 配置数据库（可选）

如果需要会话历史同步：

```bash
# 在服务器上安装PostgreSQL
sudo apt install postgresql

# 创建数据库
sudo -u postgres psql
CREATE DATABASE claude_mobile;
CREATE USER your_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE claude_mobile TO your_user;
\q

# 数据库schema会在Desktop Client首次连接时自动创建
```

### Step 4: 适配Mobile App

**注意**: Mobile App当前代码还未完全适配新架构。需要后续更新：

待实现：
- [ ] 更新WebSocket消息协议
- [ ] 实现权限请求对话框UI
- [ ] 添加设备切换状态指示
- [ ] 实现历史加载功能
- [ ] 添加加密密钥管理UI

## 📱 使用流程

### 1. 启动服务

```bash
# 在本地电脑上启动Desktop Client
cd desktop && npm start

# 在219服务器上确认Server运行
pm2 status claude-router
```

### 2. 手机连接

1. 打开Claude Code Mobile App
2. App自动连接到服务器（ws://47.99.75.219:3001/ws）
3. 服务器注册手机设备

### 3. 发送消息

1. 在手机上输入消息
2. 消息流程：
   ```
   手机 → Server(路由) → Desktop Client → Claude CLI → 输出 → Server → 手机
   ```

### 4. 权限确认

1. Claude需要执行工具时（如Bash, Edit, Read）
2. 权限请求流程：
   ```
   Claude → Desktop Client → Server → 手机（显示对话框）
   用户批准/拒绝 → Server → Desktop Client → Claude
   ```

## 🔐 加密功能

### 生成密钥

Desktop Client首次启动时自动生成密钥对：

```bash
# 密钥存储位置
~/.claude-desktop-keys.json

# 格式：
{
  "publicKey": "base64_encoded_public_key",
  "privateKey": "base64_encoded_private_key"
}
```

### 启用加密

在`.env`中设置：

```bash
ENCRYPTION_ENABLED=true
```

## 🧪 测试

### 测试Desktop Client

```bash
cd desktop

# 检查连接
curl http://47.99.75.219:3001/health

# 运行客户端（查看日志）
npm start
```

### 测试Server

```bash
# 查看统计信息
curl http://47.99.75.219:3001/api/stats

# 应该返回：
{
  "totalDevices": 2,
  "mobileDevices": 1,
  "desktopDevices": 1,
  "activeSessions": 1
}
```

### 测试完整流程

1. Desktop Client启动后显示：
   ```
   ✅ Desktop client ready!
      Waiting for messages from mobile app...
   ```

2. 手机发送消息："Hello Claude"

3. Desktop Client日志：
   ```
   📨 Received user message for session: abc-123
   🚀 Starting Claude session: abc-123
   📤 [abc-123] Output chunk (XX chars)
   ```

4. 手机收到Claude的回复

## 📊 监控

### Desktop Client状态

```bash
# 查看运行日志
tail -f ~/.claude/desktop-client.log  # 如果有日志文件

# 或直接查看终端输出
```

### Server状态

```bash
# PM2状态
pm2 status

# PM2日志
pm2 logs claude-router

# 实时统计
watch -n 5 'curl -s http://localhost:3001/api/stats | jq'
```

### 数据库查询

```bash
# 连接数据库
psql -h 47.99.75.219 -U your_user -d claude_mobile

# 查看会话
SELECT * FROM sessions ORDER BY last_activity DESC LIMIT 10;

# 查看最近消息
SELECT * FROM messages ORDER BY timestamp DESC LIMIT 20;

# 查看消息统计
SELECT
  session_id,
  COUNT(*) as message_count,
  MAX(timestamp) as last_message
FROM messages
GROUP BY session_id
ORDER BY last_message DESC;
```

## 🐛 故障排查

### Desktop Client无法连接Server

```bash
# 检查网络
ping 47.99.75.219

# 检查端口
telnet 47.99.75.219 3001

# 检查Server是否运行
curl http://47.99.75.219:3001/health
```

### Claude CLI找不到

```bash
# 检查Claude CLI
which claude

# 如果不在PATH中，在.env指定完整路径：
CLAUDE_PATH=/Users/your_user/.local/bin/claude
```

### 权限请求超时

1. 检查手机是否收到权限请求
2. 检查Server日志是否有转发记录
3. 检查Desktop Client是否收到响应

### 数据库连接失败

```bash
# 测试数据库连接
psql -h 47.99.75.219 -U your_user -d claude_mobile

# 检查防火墙
sudo ufw status

# 开放PostgreSQL端口（如需要）
sudo ufw allow 5432/tcp
```

## 📝 下一步

### 待实现功能

1. **Mobile App适配**
   - 更新WebSocket协议
   - 实现权限对话框UI
   - 添加设备切换UI
   - 历史加载功能

2. **优化**
   - 消息压缩
   - 断线重连优化
   - 会话恢复
   - 多设备状态同步

3. **安全加固**
   - Token认证
   - 速率限制
   - 异常检测

## 🔗 相关文档

- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - 详细实现计划
- [ROADMAP.md](./ROADMAP.md) - 技术路线图
- [desktop/README.md](./desktop/README.md) - Desktop Client文档
- [Happy Coder参考](https://github.com/slopus/happy) - 架构灵感来源

## 📞 支持

遇到问题？

1. 查看日志文件
2. 检查网络连接
3. 验证配置文件
4. 测试各组件独立运行

---

**架构总结**:

```
┌─────────────┐
│ Mobile App  │ (待适配)
└──────┬──────┘
       │ WebSocket
       ▼
┌─────────────┐
│   Server    │ (✅ 完成 - 消息路由器)
│   (219)     │
└──────┬──────┘
       │ WebSocket
       ▼
┌─────────────┐
│  Desktop    │ (✅ 完成)
│  Client     │
└──────┬──────┘
       │ spawn + ACP
       ▼
┌─────────────┐
│ Claude CLI  │ (官方)
└─────────────┘
```

所有核心基础设施已就绪，可以开始测试和Mobile App适配！
