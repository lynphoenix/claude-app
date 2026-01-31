# Claude Code Mobile App

通过移动端控制本地电脑上的 Claude Code CLI - 完整的移动 + 桌面 + 服务器架构。

## 🌟 核心特性

### 新架构（✅ 已实现）
```
手机App → 服务器(消息路由) → 桌面客户端 → Claude CLI(本地)
```

- ✅ **本地执行**: Claude在你的电脑上运行，访问本地文件和命令
- ✅ **移动控制**: 通过手机远程控制Claude
- ✅ **权限确认**: 手机实时显示权限请求并确认
- ✅ **会话同步**: 所有对话历史持久化到数据库
- ✅ **E2E加密**: 端到端加密保护隐私
- ✅ **设备切换**: 手机和电脑无缝切换控制

### 移动端功能
- 聊天界面与 Claude Code 交互
- 语音输入支持 (STT)
- 语音播报回复 (TTS)
- 实时连接状态显示
- 权限请求对话框（待实现）

## 📁 项目结构

```
claude-app/
├── desktop/              # ✅ 桌面客户端（新增）
│   ├── src/
│   │   ├── index.ts         # 主入口
│   │   ├── claudeManager.ts # Claude进程管理(ACP)
│   │   ├── wsClient.ts      # WebSocket客户端
│   │   ├── sessionSync.ts   # 会话同步
│   │   ├── encryption.ts    # 加密工具
│   │   ├── config.ts        # 配置管理
│   │   └── types.ts         # 类型定义
│   ├── package.json
│   ├── README.md
│   └── .env.example
│
├── server/               # ✅ 消息路由器（已重构）
│   ├── src/
│   │   ├── index.ts         # 主路由器
│   │   └── deviceManager.ts # 设备管理
│   ├── package.json
│   └── tsconfig.json
│
├── mobile/               # ⏳ 移动端（待适配新协议）
│   ├── src/
│   │   ├── components/      # UI组件
│   │   ├── screens/         # 页面
│   │   ├── services/        # WebSocket等服务
│   │   └── types/           # 类型定义
│   ├── App.tsx
│   └── package.json
│
└── docs/
    ├── DEPLOYMENT_GUIDE.md    # 部署指南
    ├── IMPLEMENTATION_PLAN.md # 实现计划
    ├── ROADMAP.md            # 技术路线图
    └── SUMMARY.md            # 实现总结
```

## 🚀 快速开始

### 1. 桌面客户端（在本地电脑）

```bash
cd desktop

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env:
#   SERVER_URL=ws://47.99.75.219:3001/ws
#   DEVICE_ID=desktop-macbook

# 确保安装了Claude Code CLI
which claude

# 启动客户端
npm start
```

### 2. 服务器（在VPS/云服务器）

```bash
cd server

# 安装依赖
npm install

# 编译
npm run build

# 启动服务（使用PM2）
pm2 start dist/index.js --name claude-router

# 或直接运行
npm start
```

### 3. 移动端（Android手机）

```bash
cd mobile

# 安装依赖
npm install

# 构建APK
npm run build

# 或开发模式
npx expo start
```

## 📊 架构说明

### 旧架构的问题
```
手机 → 服务器(执行Claude) → 结果返回
```
- ❌ Claude在服务器运行，操作服务器文件
- ❌ 无法访问本地文件
- ❌ 权限确认简陋

### 新架构的优势
```
手机 → 服务器(路由) → 桌面 → Claude(本地)
```
- ✅ Claude在本地运行，访问本地文件
- ✅ 完整的权限确认流程
- ✅ 会话历史持久化
- ✅ E2E加密
- ✅ 支持设备切换

## 🔐 安全特性

### E2E加密
- 使用 libsodium (NaCl) 加密
- 密钥对自动生成并存储在 `~/.claude-desktop-keys.json`
- 消息在传输和存储时都加密

### 权限控制
- 每个工具调用（Bash, Edit, Read等）都需要手机确认
- 实时显示工具名称和参数
- 支持批量批准模式

## 📖 详细文档

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - 完整部署指南
- [SUMMARY.md](./SUMMARY.md) - 实现总结
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - 技术实现细节
- [desktop/README.md](./desktop/README.md) - 桌面客户端文档

## 🎯 使用流程

1. **启动桌面客户端**: 在你的电脑上运行 `npm start`
2. **连接服务器**: 桌面客户端自动连接到服务器
3. **打开手机App**: 手机连接到同一服务器
4. **发送消息**: 在手机输入消息，Claude在本地执行
5. **权限确认**: 手机收到权限请求，批准/拒绝
6. **查看结果**: 实时流式显示Claude输出

## 🛠️ 开发指南

### 本地开发

**桌面客户端**:
```bash
cd desktop
npm run dev  # 自动重启
```

**服务器**:
```bash
cd server
npm run dev  # 自动重载
```

**移动端**:
```bash
cd mobile
npx expo start  # 扫码运行
```

### 测试

```bash
# 测试服务器健康状态
curl http://47.99.75.219:3001/health

# 查看设备统计
curl http://47.99.75.219:3001/api/stats
```

## 📋 待完成工作

### Mobile App适配 (⏳ 优先级高)
- [ ] 更新WebSocket消息协议
- [ ] 实现权限请求对话框UI
- [ ] 添加设备切换状态指示
- [ ] 实现历史加载功能
- [ ] 添加加密密钥管理UI

预计工作量: 2-3天

### 优化项
- [ ] 消息压缩
- [ ] 断线重连优化
- [ ] 会话恢复
- [ ] 多设备状态同步

## 🐛 故障排除

### Desktop Client无法连接
```bash
# 检查网络
ping 47.99.75.219

# 检查Claude CLI
which claude

# 查看日志
tail -f ~/.claude/desktop-client.log
```

### Server问题
```bash
# 查看PM2状态
pm2 status

# 查看日志
pm2 logs claude-router

# 重启服务
pm2 restart claude-router
```

### Mobile App问题
- 确认服务器地址正确（ws://开头）
- 检查网络连接
- 查看控制台日志

## 🙏 致谢

本项目架构灵感来自 [Happy Coder](https://github.com/slopus/happy)

## 📄 许可证

MIT License

---

## 🎉 新架构已就绪！

- ✅ Desktop Client完成
- ✅ Server重构完成
- ✅ 数据库Schema完成
- ⏳ Mobile App待适配

**所有核心基础设施已就绪，可以开始测试！**
