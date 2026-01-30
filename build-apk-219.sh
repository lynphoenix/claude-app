#!/bin/bash
# ========================================
# Claude Code Mobile - 219服务器编译脚本
# ========================================

set -e

echo "========================================"
echo "Claude Code Mobile - 编译 APK"
echo "========================================"
echo

# 设置环境变量
export ANDROID_HOME=~/Android/Sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH

# 显示配置
echo "环境配置:"
echo "  ANDROID_HOME: $ANDROID_HOME"
echo "  Java: $(java -version 2>&1 | head -1)"
echo

# 进入项目目录
cd /home/ecs-user/code/claude-app/mobile

# 读取版本号
VERSION=$(grep '"version"' app.json | sed 's/.*"version": "\(.*\)".*/\1/')
echo "正在编译版本: v$VERSION"
echo

# [1/3] 安装依赖（如果需要）
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo "[1/3] 安装依赖..."
    npm install
else
    echo "[1/3] 依赖已是最新"
fi
echo

# [2/3] 生成原生代码
echo "[2/3] 生成原生代码..."
npx expo prebuild --clean --platform android
echo

# [3/3] 编译 APK
echo "[3/3] 编译 APK..."
cd android
./gradlew assembleRelease
cd ..
echo

# 复制 APK 到项目根目录
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
    OUTPUT_NAME="claude-code-mobile-v${VERSION}.apk"
    cp "$APK_PATH" "/home/ecs-user/code/claude-app/$OUTPUT_NAME"
    echo "========================================"
    echo "✅ 编译成功!"
    echo "========================================"
    echo
    echo "APK 位置:"
    echo "  /home/ecs-user/code/claude-app/$OUTPUT_NAME"
    echo
    ls -lh "/home/ecs-user/code/claude-app/$OUTPUT_NAME"
else
    echo "❌ 编译失败: 找不到 APK 文件"
    exit 1
fi
