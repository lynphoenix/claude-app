@echo off
setlocal EnableDelayedExpansion

REM 设置路径
set "NODE_HOME=D:\work\code\claude-app\tools\node"
set "PATH=%NODE_HOME%;%PATH%"

echo Building APK v1.0.27...
echo.

REM 进入 mobile 目录
cd /d D:\work\code\claude-app\mobile

REM 运行 expo prebuild
echo [1/2] Running expo prebuild...
call "%NODE_HOME%\npx.cmd" expo prebuild --clean
if !ERRORLEVEL! NEQ 0 (
    echo Prebuild failed
    exit /b 1
)

REM 编译 APK
echo [2/2] Building APK...
cd android
call gradlew.bat assembleRelease
if !ERRORLEVEL! NEQ 0 (
    echo Build failed
    exit /b 1
)

echo.
echo Build successful! APK at: mobile\android\app\build\outputs\apk\release\app-release.apk
