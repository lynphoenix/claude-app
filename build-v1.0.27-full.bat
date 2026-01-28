@echo off
echo ========================================
echo Building Claude Code Mobile v1.0.27
echo ========================================
echo.

set NODE_PATH=D:\work\code\claude-app\tools\node
set PATH=%NODE_PATH%;%NODE_PATH%\node_modules\.bin;%PATH%

echo [1/3] Node.js version:
node --version
npm --version
echo.

echo [2/3] Running expo prebuild...
cd /d D:\work\code\claude-app\mobile
npx expo prebuild --clean
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] expo prebuild failed
    pause
    exit /b 1
)
echo.

echo [3/3] Building APK...
cd android
gradlew.bat assembleRelease
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Gradle build failed
    pause
    exit /b 1
)
echo.

echo ========================================
echo Build successful!
echo APK: mobile\android\app\build\outputs\apk\release\app-release.apk
echo ========================================
echo.
pause
