@echo off
REM Windows编译脚本 - 编译Claude Code Mobile App v1.0.15

echo =====================================
echo Claude Code Mobile App - Windows编译
echo =====================================
echo.

REM 进入项目目录
cd /d D:\work\code\claude-app\mobile
if errorlevel 1 (
    echo [错误] 无法进入项目目录
    pause
    exit /b 1
)

echo [1/5] 当前目录: %CD%
echo.

REM 检查Node.js
echo [2/5] 检查Node.js环境...
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未安装Node.js
    echo 请先安装Node.js: https://nodejs.org/
    pause
    exit /b 1
)
node -v
npm -v
echo.

REM 检查Android SDK
echo [3/5] 检查Android环境...
if not defined ANDROID_HOME (
    echo [警告] ANDROID_HOME未设置
    echo 请设置环境变量 ANDROID_HOME
)
echo ANDROID_HOME=%ANDROID_HOME%
echo.

REM 安装依赖（如果需要）
echo [4/5] 检查依赖...
if not exist node_modules (
    echo 正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
) else (
    echo 依赖已存在，跳过安装
)
echo.

REM 生成原生项目（如果需要）
echo [5/5] 准备编译...
if not exist android (
    echo 生成Android原生项目...
    call npx expo prebuild --platform android
    if errorlevel 1 (
        echo [错误] prebuild失败
        pause
        exit /b 1
    )
)
echo.

REM 开始编译
echo =====================================
echo 开始编译APK...
echo =====================================
cd android
call gradlew.bat clean assembleRelease
if errorlevel 1 (
    echo.
    echo [错误] 编译失败！
    echo 请查看上面的错误信息
    pause
    exit /b 1
)

echo.
echo =====================================
echo 编译成功！
echo =====================================
echo.

REM 显示APK位置
set APK_PATH=app\build\outputs\apk\release\app-release.apk
if exist %APK_PATH% (
    echo APK位置: %CD%\%APK_PATH%
    echo 文件大小:
    dir %APK_PATH% | findstr app-release.apk
    echo.
    echo 下一步：
    echo 1. 将APK复制到桌面: copy %APK_PATH% %USERPROFILE%\Desktop\claude-v15.apk
    echo 2. 或通过adb安装: adb install -r %APK_PATH%
) else (
    echo [警告] 未找到APK文件
)

echo.
pause
