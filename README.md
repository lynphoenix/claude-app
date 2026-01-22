# Claude Code Mobile App

通过 Android 手机访问远程服务器上的 Claude Code CLI 的移动应用。

## 功能特性

- 聊天界面与 Claude Code 交互
- 语音输入支持 (STT)
- 语音播报回复 (TTS，可开关)
- 多项目目录切换
- 实时连接状态显示
- 设置面板（服务器地址、TTS 开关等）

## 项目结构

```
claude-app/
├── mobile/                 # React Native Expo 移动端应用
│   ├── src/
│   │   ├── components/    # UI 组件
│   │   ├── screens/       # 页面/屏幕
│   │   ├── services/      # 服务层 (WebSocket, Voice, Storage)
│   │   ├── types/         # TypeScript 类型定义
│   │   └── utils/         # 工具函数
│   ├── App.tsx            # 应用入口
│   ├── app.json           # Expo 配置
│   └── package.json
│
├── server/                # Node.js WebSocket 服务端
│   ├── src/
│   │   ├── index.ts       # 服务器入口
│   │   └── claudeHandler.ts  # Claude Code CLI 处理器
│   ├── .env.example       # 环境变量示例
│   ├── tsconfig.json      # TypeScript 配置
│   └── package.json
│
└── .github/
    └── workflows/
        └── build-android.yml  # GitHub Actions 自动构建
```

## 部署指南

### 1. 服务端部署

#### 前置要求

- Node.js 20+
- Claude Code CLI 已安装并在 PATH 中
- 一个或多个项目目录

#### 步骤

1. **安装依赖**

```bash
cd server
npm install
```

2. **配置环境变量**

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
PORT=3001
DEFAULT_PROJECT_PATH=/home/user/projects/default
ALLOWED_PROJECTS=/home/user/projects/project1,/home/user/projects/project2
CORS_ORIGIN=*
```

3. **启动服务**

```bash
# 开发模式（带热重载）
npm run dev

# 生产模式
npm run build
npm start
```

4. **使用 PM2 保持运行（推荐）**

```bash
npm install -g pm2

# 启动服务
pm2 start dist/index.js --name claude-code-server

# 开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs claude-code-server

# 重启服务
pm2 restart claude-code-server
```

5. **配置反向代理（使用 Nginx）**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. 移动端部署

#### 方式一：使用 Expo EAS 构建（推荐）

1. **安装 Expo CLI**

```bash
npm install -g eas-cli
```

2. **登录 Expo 账号**

```bash
eas login
```

3. **配置项目**

```bash
cd mobile
eas build:configure
```

4. **构建 Android APK**

```bash
eas build --platform android --output ./app.apk
```

构建完成后，APK 文件将保存在 `mobile/app.apk`。

#### 方式二：本地构建

1. **安装依赖**

```bash
cd mobile
npm install
```

2. **开发模式运行**

```bash
# 使用 Expo Go 应用扫描二维码
npx expo start

# 或在 Android 模拟器上运行
npx expo start --android
```

3. **生产构建**

```bash
# 构建 APK
npx expo build:android
```

### 3. GitHub Actions 自动构建

1. **设置 GitHub Secrets**

在 GitHub 仓库设置中添加以下 Secret：
- `EXPO_TOKEN`: Expo 账号的访问令牌（获取方式：`eas token`）

2. **触发构建**

- 推送代码到 `main` 或 `develop` 分支
- 或手动触发：Actions → Build Android APK → Run workflow

3. **下载 APK**

构建完成后，从 Actions 页面下载 APK 文件，或从 Releases 页面下载。

## 使用指南

### 首次使用

1. **安装 APK** 到 Android 手机

2. **打开应用**，点击右上角设置图标

3. **配置服务器地址**：
   - 输入你的服务器地址（如 `http://your-server.com:3001`）
   - 点击保存

4. **连接服务器**：
   - 选择一个项目目录
   - 应用会自动连接到服务器

### 功能说明

| 功能 | 说明 |
|------|------|
| 项目切换 | 点击顶部的项目选择器，切换不同的项目目录 |
| 发送消息 | 在底部输入框输入文字，点击发送按钮 |
| 语音输入 | 点击麦克风按钮开始语音输入（开发中） |
| 语音播报 | 在设置中开启/关闭语音播报功能 |
| 重新连接 | 连接断开时，点击"重新连接"按钮 |

## 开发指南

### 本地开发

**服务端：**

```bash
cd server
npm run dev
```

**移动端：**

```bash
cd mobile
npx expo start
```

然后使用 Expo Go 应用扫描二维码。

### 添加新功能

1. 在 `mobile/src/types/index.ts` 添加类型定义
2. 在 `mobile/src/services/` 添加服务逻辑
3. 在 `mobile/src/components/` 添加 UI 组件
4. 在 `mobile/src/screens/` 集成组件

## 故障排除

### 服务端

**问题：Claude Code CLI 无法启动**
- 检查 Claude Code CLI 是否正确安装：`which claude`
- 检查项目路径是否正确且有访问权限

**问题：WebSocket 连接失败**
- 检查防火墙设置
- 确认端口未被占用
- 检查 Nginx 配置（如果使用）

### 移动端

**问题：无法连接到服务器**
- 确认手机和服务器在同一网络，或服务器有公网 IP
- 检查服务器地址格式（`http://` 开头）
- 确认服务器正在运行

**问题：语音功能不工作**
- 检查应用权限（麦克风）
- 在设置中确认语音播报已开启

## 许可证

MIT License
