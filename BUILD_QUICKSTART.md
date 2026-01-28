# 快速编译指南

## 一键编译（推荐）

1. 双击运行 `install-nodejs.bat` 安装 Node.js
2. 双击运行 `build-apk.bat` 开始编译

## 手动步骤

### 1. 安装 Node.js
```bash
# 选项A: 使用便携版脚本
install-nodejs.bat

# 选项B: 官网安装
# 访问 https://nodejs.org/ 下载 LTS 版本
```

### 2. 编译 APK
```bash
# 自动编译
build-apk.bat

# 或手动执行
cd mobile
npm install
npx expo prebuild --clean
cd android
gradlew.bat assembleRelease
```

## 脚本说明

| 脚本 | 说明 |
|------|------|
| `install-nodejs.bat` | 自动下载并安装便携版 Node.js |
| `build-apk.bat` | 自动编译 APK（完整流程） |
| `check-env.bat` | 检查开发环境 |
| `check-env.ps1` | PowerShell 环境检查（更详细） |

## 编译产物

编译成功后，APK 文件位于：
```
mobile/android/app/build/outputs/apk/release/app-release.apk
```

## 故障排除

### Node.js 未找到
```bash
# 重启命令提示符，或使用完整路径
set PATH=%CD%\tools\node;%PATH%
```

### Gradle 构建失败
```bash
cd mobile/android
gradlew.bat clean
gradlew.bat assembleRelease
```

### Java 版本问题
当前安装的 Java 1.8 可能需要升级到 Java 17：
- 下载: https://adoptium.net/

## 版本信息

- **当前版本**: v1.0.16
- **修复内容**:
  - 键盘遮挡修复
  - WebSocket 自动重连
  - 消息解析优化
