@echo off
REM ========================================
REM Claude Code Mobile - 本地编译脚本
REM ========================================

setlocal enabledelayedexpansion

REM 设置 Node.js 路径（项目本地安装）
set "NODE_HOME=%~dp0tools\node"
set "PATH=%NODE_HOME%;%PATH%"

echo ========================================
echo Claude Code Mobile v1.0.27 - 本地编译
echo ========================================
echo.
echo Node.js: %NODE_HOME%
echo.

REM 进入 mobile 目录
cd /d "%~dp0mobile"

echo [1/4] 安装依赖...
call "%NODE_HOME%\npm.cmd" install
if %ERRORLEVEL% NEQ 0 (
    echo [错误] npm install 失败
    pause
    exit /b 1
)
echo.

echo [2/4] 生成原生代码...
call "%NODE_HOME%\npx.cmd" expo prebuild --clean
if %ERRORLEVEL% NEQ 0 (
    echo [错误] expo prebuild 失败
    pause
    exit /b 1
)
echo.

echo [3/4] 编译 APK...
cd android
call gradlew.bat assembleRelease
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 编译失败
    pause
    exit /b 1
)
cd ..
echo.

echo [4/4] 编译完成!
echo.
echo APK 位置:
echo mobile\android\app\build\outputs\apk\release\app-release.apk
echo.

pause
