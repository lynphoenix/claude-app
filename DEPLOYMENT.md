# 部署指南

## 系统架构

```
Mobile App (Android) ↔ Server (消息路由) ↔ Desktop Client ↔ Claude CLI
```

## 当前部署环境

### Server
- **位置**: 47.99.75.219:3001
- **目录**: `/home/ecs-user/claude-app-server`
- **进程管理**: PM2 (进程名: claude-router)
- **启动命令**: `pm2 start npm --name claude-router -- start`

### Desktop Client
- **位置**: 47.99.75.219
- **目录**: `/home/ecs-user/claude-app/desktop`
- **进程管理**: PM2 (进程名: desktop-client)
- **配置文件**: `ecosystem.config.cjs`
- **启动命令**: `pm2 start ecosystem.config.cjs`

### Mobile App
- **版本**: v1.0.29-fixed
- **构建位置**: `/Users/linyining/Documents/code/diy/claude-app/mobile`
- **APK**: `claude-code-v1.0.29-fixed.apk`
- **Server URL**: `ws://47.99.75.219:3001`

## 部署步骤

### 1. Server部署

```bash
# SSH到服务器
ssh ecs-user@47.99.75.219

# 进入Server目录
cd ~/claude-app-server

# 拉取最新代码
git pull origin dev

# 安装依赖（如果需要）
npm install

# 构建
npm run build

# 重启服务
pm2 restart claude-router

# 查看日志
pm2 logs claude-router
```

### 2. Desktop Client部署

```bash
# 在服务器上
cd ~/claude-app/desktop

# 拉取最新代码
git pull origin dev

# 安装依赖（如果需要）
npm install

# 构建
npm run build

# 重启服务
pm2 restart desktop-client

# 查看日志
pm2 logs desktop-client
```

### 3. Mobile App部署

#### 本地构建（H100服务器）

```bash
# SSH到H100
ssh root@47.99.75.219

# 进入项目目录
cd ~/data2/lyn/claude-app/mobile

# 拉取最新代码
git pull origin dev

# 安装依赖（如果需要）
npm install

# 构建APK
./gradlew assembleDebug

# 下载APK到本地
# 本地执行：
scp root@47.99.75.219:~/data2/lyn/claude-app/mobile/android/app/build/outputs/apk/debug/app-debug.apk ~/Downloads/
```

#### 安装到设备

```bash
# 本地执行
~/bin/adb install -r ~/Downloads/app-debug.apk
```

## 环境变量配置

### Desktop Client (ecosystem.config.cjs)

```javascript
env: {
  SERVER_URL: 'ws://localhost:3001/ws',
  DEVICE_ID: 'desktop-219',
  ENCRYPTION_ENABLED: 'false',
  CLAUDE_PATH: '/home/ecs-user/.local/share/claude/versions/2.1.17',
  WORK_DIR: '/home/ecs-user/workspace',
  ANTHROPIC_AUTH_TOKEN: 'apikey-xxx',
  ANTHROPIC_BASE_URL: 'https://api.atlascloud.ai',
  ANTHROPIC_MODEL: 'anthropic/claude-sonnet-4.5-20250929'
}
```

### Server (.env)

```bash
PORT=3001
```

## 监控和维护

### 查看服务状态

```bash
pm2 status
```

### 查看实时日志

```bash
# Server日志
pm2 logs claude-router --lines 100

# Desktop Client日志
pm2 logs desktop-client --lines 100
```

### 重启所有服务

```bash
pm2 restart all
```

### 保存PM2配置

```bash
pm2 save
pm2 startup
```

## 故障排查

### 1. Mobile App连接失败

**检查**:
- Server是否运行: `pm2 status`
- 端口是否开放: `netstat -tlnp | grep 3001`
- 防火墙设置

**解决**:
```bash
pm2 restart claude-router
```

### 2. 消息无响应

**检查**:
- Desktop Client是否运行: `pm2 status`
- Desktop Client日志: `pm2 logs desktop-client`
- Claude CLI是否可用: `/home/ecs-user/.local/share/claude/versions/2.1.17 --version`

**解决**:
```bash
pm2 restart desktop-client
```

### 3. Session绑定问题

**现象**: Mobile发送消息后无响应

**检查**:
- Server日志是否有"Auto-binding"
- Desktop是否注册成功

**解决**: Server已实现Auto-binding，会自动恢复

### 4. API Key错误

**现象**: Desktop日志显示"invalid API key"

**检查**:
- `pm2 env 4 | grep ANTHROPIC`

**解决**:
```bash
# 编辑配置
vi ~/claude-app/desktop/ecosystem.config.cjs

# 重启
pm2 delete desktop-client
pm2 start ~/claude-app/desktop/ecosystem.config.cjs
```

## 性能优化

### Server
- 使用PM2集群模式（如果需要）
- 配置max_memory_restart

### Desktop Client
- 限制并发Claude sessions
- 配置合理的work directory

## 安全注意事项

1. **API Keys**: 不要提交到Git
2. **防火墙**: 只开放必要端口
3. **HTTPS**: 生产环境建议使用WSS
4. **认证**: 考虑添加设备认证机制

## 备份

### 代码备份
- Git仓库: github.com/lynphoenix/claude-app

### 配置备份
```bash
# 备份PM2配置
pm2 save

# 备份ecosystem配置
cp ~/claude-app/desktop/ecosystem.config.cjs ~/backup/
```

## 版本历史

- **v1.0.29-fixed** (2026-01-31): UI卡住问题修复，Auto-binding
- **v1.0.29** (2026-01-31): 三层架构初始版本
- **v1.0.28** (2026-01-29): sessionId修复

---

**维护人员**: linyining
**更新日期**: 2026-01-31
