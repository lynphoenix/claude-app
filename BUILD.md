# 编译指南

## Android Studio 本地编译

### 前置要求
- ✅ Android Studio (最新版)
- ✅ Android SDK (API 34+)
- ✅ Node.js (v18+)
- ✅ JDK 17

### 步骤

#### 1. 准备项目
```bash
cd /path/to/claude-app/mobile

# 安装依赖
npm install

# 生成原生项目 (如果android目录不存在)
npx expo prebuild --platform android
```

#### 2. 打开Android Studio
```bash
# 方法1: 命令行
cd mobile/android
open -a "Android Studio" .

# 方法2: Android Studio菜单
# File -> Open -> 选择 mobile/android 目录
```

#### 3. 同步Gradle
- Android Studio会自动提示同步Gradle
- 点击 "Sync Now"
- 等待依赖下载完成

#### 4. 编译APK

**方法A: Android Studio UI**
1. Build -> Build Bundle(s) / APK(s) -> Build APK(s)
2. 等待编译完成
3. 点击通知栏的 "locate" 找到APK
4. APK位置: `android/app/build/outputs/apk/release/app-release.apk`

**方法B: 命令行**
```bash
cd mobile/android

# Debug版本
./gradlew assembleDebug

# Release版本
./gradlew assembleRelease

# 清理后编译
./gradlew clean assembleRelease
```

#### 5. 安装APK
```bash
# 找到编译好的APK
ls -lh android/app/build/outputs/apk/release/

# 安装到已连接的设备
adb install -r android/app/build/outputs/apk/release/app-release.apk

# 或复制到Mac桌面
cp android/app/build/outputs/apk/release/app-release.apk ~/Desktop/claude-v15.apk
```

---

## 常见问题

### Q1: Gradle下载缓慢
**解决方案**: 配置国内镜像

编辑 `android/build.gradle`:
```gradle
allprojects {
    repositories {
        maven { url 'https://maven.aliyun.com/repository/public/' }
        maven { url 'https://maven.aliyun.com/repository/google/' }
        google()
        mavenCentral()
    }
}
```

### Q2: 内存不足
**解决方案**: 增加Gradle内存

编辑 `android/gradle.properties`:
```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m
```

### Q3: SDK版本问题
**解决方案**: 确保安装了正确的SDK

Android Studio -> Preferences -> Appearance & Behavior -> System Settings -> Android SDK
- 安装 Android 14 (API 34)
- 安装 Build Tools 34.0.0

### Q4: 签名问题
**Debug版本**: 自动签名
**Release版本**: 需要配置签名

编辑 `android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.debug // 临时使用debug签名
            minifyEnabled false
        }
    }
}
```

### Q5: 网络权限
确保 `AndroidManifest.xml` 包含:
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

---

## EAS云编译（当额度恢复后）

### 方法1: 命令行
```bash
cd mobile

# 登录EAS
eas login

# 编译
eas build --platform android --profile preview

# 等待完成，会显示下载链接
```

### 方法2: 网页
1. 访问: https://expo.dev/accounts/lynphoenix/projects/claude-code-mobile
2. 点击 "Build"
3. 选择 Android + Preview
4. 等待完成后下载

---

## 版本管理

### 更新版本号
编辑 `mobile/app.json`:
```json
{
  "expo": {
    "version": "1.0.16",  // 修改这里
    "android": {
      "versionCode": 4     // 每次编译递增
    }
  }
}
```

### 版本命名规范
- 主版本.次版本.修订号
- 例如: 1.0.15
  - 1 = 主版本（重大架构变更）
  - 0 = 次版本（功能增加）
  - 15 = 修订号（bug修复）

---

## 当前版本状态

| 版本 | 状态 | 编译方式 | 主要变更 |
|------|------|----------|----------|
| v1.0.15 | 📝 待编译 | 本地 | 消息解析修复 + adjustResize |
| v1.0.14 | ✅ 已编译 | EAS | adjustResize（未修复解析） |
| v1.0.13 | ✅ 已编译 | EAS | adjustPan + 错误解析 |
| v1.0.12 | ✅ 已编译 | EAS | 基础功能 |

---

## 快速编译命令

```bash
# 完整流程（首次）
cd mobile
npm install
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk

# 快速重编译（代码改动后）
cd mobile/android
./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

---

## 调试

### 查看日志
```bash
# Android设备日志
adb logcat | grep "Claude"

# React Native日志
npx react-native log-android

# 应用崩溃日志
adb logcat AndroidRuntime:E *:S
```

### Chrome调试
1. 运行开发版本: `npx expo start`
2. 摇动设备
3. 选择 "Debug JS Remotely"
4. Chrome会自动打开调试器

---

**最后更新**: 2026-01-26
**推荐编译**: v1.0.15 (本地Android Studio)
