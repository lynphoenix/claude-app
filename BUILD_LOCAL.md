# 本地编译 APK 指南

## 环境要求

### 1. 安装 Node.js (必需)
- 下载地址: https://nodejs.org/
- 推荐版本: LTS 20.x 或更高
- 安装后重启终端/命令提示符

### 2. Android Studio (必需)
- 已安装: ✅ `C:\Program Files\Android\`
- 需要安装 SDK Platform 和 SDK Build Tools

### 3. Java JDK
- 已安装: ✅ Java 1.8.0_45
- 注意: Expo SDK 54 可能需要 Java 17

## 编译步骤

### 方式一：使用 EAS 本地构建 (需要 Docker)

1. 安装 Docker Desktop
2. 安装 EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
3. 在 mobile 目录运行:
   ```bash
   cd mobile
   eas build --platform android --profile preview --local
   ```

### 方式二：使用 Android Studio (推荐)

#### 步骤 1: 安装依赖
```bash
cd D:\work\code\claude-app\mobile
npm install
```

#### 步骤 2: 生成原生代码
```bash
npx expo prebuild --clean
```

#### 步骤 3: 使用 Android Studio 编译
1. 打开 Android Studio
2. 选择 "Open" → 打开 `mobile/android` 目录
3. 等待 Gradle 同步完成
4. 选择 Build → Build Bundle(s) / APK(s) → Build APK(s)
5. APK 将生成在 `mobile/android/app/build/outputs/apk/release/`

### 方式三：使用命令行编译

#### 步骤 1-2: 同上

#### 步骤 3: 使用 Gradlew 编译
```bash
cd android
./gradlew assembleRelease
# 或者在 Windows 上
gradlew.bat assembleRelease
```

## 当前配置

- 版本: 1.0.16
- 修复内容:
  - ✅ 键盘遮挡修复 (移除 KeyboardAvoidingView)
  - ✅ 消息解析修复
  - ✅ WebSocket URL 更新自动重连

## 常见问题

### 1. Gradle 下载慢
- 配置国内镜像: 在 `android/build.gradle` 中添加阿里云镜像

### 2. Java 版本问题
- 如遇 Java 版本错误，安装 Java 17:
  - 下载: https://adoptium.net/

### 3. 编译失败
- 清理构建: `cd android && ./gradlew clean`
- 删除 node_modules: `rm -rf node_modules && npm install`

## 快速命令参考

安装 Node.js 后，在 `mobile` 目录运行:

```bash
# 安装依赖
npm install

# 生成原生代码
npx expo prebuild --clean

# 命令行编译 APK
cd android
gradlew.bat assembleRelease
```

编译完成后，APK 位置:
```
mobile/android/app/build/outputs/apk/release/app-release.apk
```
