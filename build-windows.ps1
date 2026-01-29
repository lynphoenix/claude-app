# Windows PowerShell编译脚本 - Claude Code Mobile App v1.0.15
# 使用方法: 右键点击 -> "使用PowerShell运行"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Claude Code Mobile App - Windows编译" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 进入项目目录
$ProjectPath = "D:\work\code\claude-app\mobile"
Write-Host "[1/6] 进入项目目录: $ProjectPath" -ForegroundColor Yellow

if (-not (Test-Path $ProjectPath)) {
    Write-Host "[错误] 项目目录不存在: $ProjectPath" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}

Set-Location $ProjectPath
Write-Host "当前目录: $(Get-Location)" -ForegroundColor Green
Write-Host ""

# 检查Node.js
Write-Host "[2/6] 检查Node.js环境..." -ForegroundColor Yellow
try {
    $nodeVersion = node -v
    $npmVersion = npm -v
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
    Write-Host "npm: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "[错误] 未安装Node.js" -ForegroundColor Red
    Write-Host "请先安装Node.js: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "按回车键退出"
    exit 1
}
Write-Host ""

# 检查Android SDK
Write-Host "[3/6] 检查Android环境..." -ForegroundColor Yellow
$androidHome = $env:ANDROID_HOME
if ($androidHome) {
    Write-Host "ANDROID_HOME: $androidHome" -ForegroundColor Green

    # 检查gradle
    $gradlePath = Join-Path $ProjectPath "android\gradlew.bat"
    if (Test-Path $gradlePath) {
        Write-Host "Gradle wrapper: 已找到" -ForegroundColor Green
    }
} else {
    Write-Host "[警告] ANDROID_HOME未设置" -ForegroundColor Yellow
    Write-Host "如果编译失败，请设置环境变量 ANDROID_HOME" -ForegroundColor Yellow
}
Write-Host ""

# 检查依赖
Write-Host "[4/6] 检查Node依赖..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "正在安装依赖（这可能需要几分钟）..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 依赖安装失败" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }
    Write-Host "依赖安装完成" -ForegroundColor Green
} else {
    Write-Host "依赖已存在，跳过安装" -ForegroundColor Green
}
Write-Host ""

# 生成原生项目
Write-Host "[5/6] 准备Android项目..." -ForegroundColor Yellow
if (-not (Test-Path "android")) {
    Write-Host "生成Android原生项目..." -ForegroundColor Yellow
    npx expo prebuild --platform android
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] prebuild失败" -ForegroundColor Red
        Read-Host "按回车键退出"
        exit 1
    }
    Write-Host "Android项目生成完成" -ForegroundColor Green
} else {
    Write-Host "Android项目已存在" -ForegroundColor Green
}
Write-Host ""

# 开始编译
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "[6/6] 开始编译APK..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "这可能需要5-15分钟，请耐心等待..." -ForegroundColor Yellow
Write-Host ""

Set-Location "android"
$startTime = Get-Date

# 执行编译
.\gradlew.bat clean assembleRelease

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Red
    Write-Host "[错误] 编译失败！" -ForegroundColor Red
    Write-Host "=====================================" -ForegroundColor Red
    Write-Host "请查看上面的错误信息" -ForegroundColor Yellow
    Read-Host "按回车键退出"
    exit 1
}

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host "=====================================" -ForegroundColor Green
Write-Host "编译成功！" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host "耗时: $($duration.TotalMinutes.ToString('0.00')) 分钟" -ForegroundColor Green
Write-Host ""

# 显示APK信息
$apkPath = "app\build\outputs\apk\release\app-release.apk"
if (Test-Path $apkPath) {
    $apkFullPath = Resolve-Path $apkPath
    $apkSize = (Get-Item $apkPath).Length / 1MB

    Write-Host "📦 APK位置:" -ForegroundColor Cyan
    Write-Host "   $apkFullPath" -ForegroundColor White
    Write-Host ""
    Write-Host "📏 文件大小: $($apkSize.ToString('0.00')) MB" -ForegroundColor Cyan
    Write-Host ""

    # 复制到桌面
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $desktopApk = Join-Path $desktopPath "claude-v15.apk"

    Write-Host "正在复制APK到桌面..." -ForegroundColor Yellow
    Copy-Item $apkPath $desktopApk -Force
    Write-Host "✅ 已复制到: $desktopApk" -ForegroundColor Green
    Write-Host ""

    Write-Host "下一步操作:" -ForegroundColor Cyan
    Write-Host "1. 从桌面获取APK文件" -ForegroundColor White
    Write-Host "2. 或使用adb安装: adb install -r `"$apkFullPath`"" -ForegroundColor White
    Write-Host "3. 或使用共享文件夹传回Mac" -ForegroundColor White
} else {
    Write-Host "[警告] 未找到APK文件" -ForegroundColor Yellow
    Write-Host "预期位置: $apkPath" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Read-Host "按回车键退出"
