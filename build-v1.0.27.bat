@echo off
echo Building APK v1.0.27...
echo.
set PATH=D:\work\code\claude-app\tools\node;D:\work\code\claude-app\tools\node_modules\.bin;%PATH%
cd /d D:\work\code\claude-app\mobile\android
echo Current directory: %CD%
echo PATH=%PATH%
gradlew.bat assembleRelease
if %ERRORLEVEL% EQU 0 (
    echo.
    echo Build successful!
    echo APK location: mobile\android\app\build\outputs\apk\release\app-release.apk
) else (
    echo.
    echo Build failed with error code %ERRORLEVEL%
)
pause
