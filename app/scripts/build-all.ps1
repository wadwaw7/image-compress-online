# ============================================================
# ImageCompress 全平台构建脚本
# 用法: .\scripts\build-all.ps1 [-SkipWindows] [-SkipAndroid]
# 前提: Node.js, Rust (for Tauri), Android SDK (for Capacitor)
# ============================================================
param(
    [switch]$SkipWindows,
    [switch]$SkipAndroid
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $AppRoot
$DownloadDir = Join-Path $RepoRoot "download"
$VersionFile = Join-Path $AppRoot "src\public\version.json"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ImageCompress 全平台构建" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Read version
if (Test-Path $VersionFile) {
    $version = (Get-Content $VersionFile -Raw | ConvertFrom-Json).version
    Write-Host "[信息] 构建版本: v$version" -ForegroundColor Yellow
}

# Step 1: Vite web build
Write-Host "`n[1/4] Vite 前端构建..." -ForegroundColor Green
Push-Location $AppRoot
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }
    Write-Host "  ✓ Vite 构建完成 -> app/dist/" -ForegroundColor Green
} finally {
    Pop-Location
}

# Step 2: Tauri Windows build
if (-not $SkipWindows) {
    Write-Host "`n[2/4] Tauri Windows 桌面构建..." -ForegroundColor Green
    Push-Location $AppRoot
    try {
        $rustInstalled = Get-Command cargo -ErrorAction SilentlyContinue
        if (-not $rustInstalled) {
            Write-Host "  ⚠ Rust 未安装，跳过 Windows 构建" -ForegroundColor Yellow
            Write-Host "  安装 Rust: winget install Rustlang.Rustup" -ForegroundColor Yellow
        } else {
            npx tauri build
            if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

            # Find the NSIS installer
            $nsisDir = Join-Path $AppRoot "src-tauri\target\release\bundle\nsis"
            $installer = Get-ChildItem -Path $nsisDir -Filter "*setup.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($installer) {
                $dest = Join-Path $DownloadDir "imagecompress-setup.exe"
                Copy-Item -Path $installer.FullName -Destination $dest -Force
                Write-Host "  ✓ Windows 安装包 -> download/imagecompress-setup.exe" -ForegroundColor Green
                $size = [math]::Round($installer.Length / 1MB, 1)
                Write-Host "  文件大小: ${size}MB" -ForegroundColor Gray
            }
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[2/4] Tauri Windows 构建 (已跳过)" -ForegroundColor Gray
}

# Step 3: Capacitor Android build
if (-not $SkipAndroid) {
    Write-Host "`n[3/4] Capacitor Android APK 构建..." -ForegroundColor Green
    Push-Location $AppRoot
    try {
        $androidProj = Join-Path $AppRoot "android"
        if (-not (Test-Path $androidProj)) {
            Write-Host "  ⚠ Android 项目未初始化，跳过 APK 构建" -ForegroundColor Yellow
            Write-Host "  初始化: npx cap add android (需要 Android Studio + SDK)" -ForegroundColor Yellow
        } else {
            npx cap sync
            Push-Location $androidProj
            try {
                ./gradlew assembleRelease
                if ($LASTEXITCODE -ne 0) { throw "Android build failed" }

                $apkPath = Join-Path $androidProj "app\build\outputs\apk\release\app-release.apk"
                if (Test-Path $apkPath) {
                    $dest = Join-Path $DownloadDir "imagecompress.apk"
                    Copy-Item -Path $apkPath -Destination $dest -Force
                    Write-Host "  ✓ Android APK -> download/imagecompress.apk" -ForegroundColor Green
                    $size = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
                    Write-Host "  文件大小: ${size}MB" -ForegroundColor Gray
                }
            } finally {
                Pop-Location
            }
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[3/4] Android APK 构建 (已跳过)" -ForegroundColor Gray
}

# Step 4: Generate checksums
Write-Host "`n[4/4] 生成校验和..." -ForegroundColor Green
Push-Location $DownloadDir
try {
    $files = Get-ChildItem -Filter "*.exe", "*.apk" -ErrorAction SilentlyContinue
    if ($files) {
        foreach ($f in $files) {
            $hash = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash
            $hashFile = $f.FullName + ".sha256"
            Set-Content -Path $hashFile -Value $hash
            Write-Host "  ✓ $($f.Name) -> SHA256: $($hash.Substring(0,16))..." -ForegroundColor Gray
        }
    }
} finally {
    Pop-Location
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  构建完成!" -ForegroundColor Cyan
Write-Host "  输出目录: $DownloadDir" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# List outputs
Get-ChildItem $DownloadDir | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    $size = if ($_.Length -gt 1MB) { "$([math]::Round($_.Length/1MB,1)) MB" } else { "$([math]::Round($_.Length/1KB,1)) KB" }
    Write-Host "  $($_.Name) ($size)" -ForegroundColor White
}
