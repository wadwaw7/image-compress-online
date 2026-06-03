# ============================================================
# ImageCompress 部署脚本
# 将构建产物上传到阿里云服务器
# 用法: .\scripts\deploy.ps1 [-Server <ip>] [-SkipBuild]
# ============================================================
param(
    [string]$Server = "123.56.235.54",
    [string]$User = "root",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Split-Path -Parent $ScriptDir
$RepoRoot = Split-Path -Parent $AppRoot
$PublicDir = Join-Path $RepoRoot "public"
$DownloadDir = Join-Path $RepoRoot "download"
$DistDir = Join-Path $AppRoot "dist"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ImageCompress 部署到 $Server" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Build (if not skipped)
if (-not $SkipBuild) {
    Write-Host "[1/3] 构建项目..." -ForegroundColor Green
    Push-Location $AppRoot
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }
    Pop-Location
    Write-Host "  ✓ 构建完成" -ForegroundColor Green
} else {
    Write-Host "[1/3] 构建 (已跳过)" -ForegroundColor Gray
}

# Step 2: Upload files
Write-Host "`n[2/3] 上传文件到服务器..." -ForegroundColor Green

# Upload download files (APK, EXE)
$downloadFiles = Get-ChildItem $DownloadDir -File -ErrorAction SilentlyContinue
if ($downloadFiles) {
    Write-Host "  上传下载文件..." -ForegroundColor Gray
    scp -r (Join-Path $DownloadDir "*") "$User@$Server`:/var/www/download/"
    Write-Host "  ✓ 下载文件上传完成" -ForegroundColor Green
} else {
    Write-Host "  ⚠ download/ 目录为空，跳过" -ForegroundColor Yellow
}

# Upload app dist files
Write-Host "  上传 App 前端文件..." -ForegroundColor Gray
scp -r (Join-Path $DistDir "*") "$User@$Server`:/var/www/app/"
Write-Host "  ✓ App 前端上传完成" -ForegroundColor Green

# Upload public pages (download.html, updated nav pages)
Write-Host "  上传网页文件..." -ForegroundColor Gray
scp (Join-Path $PublicDir "download.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "index.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "about.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "changelog.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "changelog.json") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "feedback.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "privacy.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "donate.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "bg-change.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "watermark-remover.html") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
scp (Join-Path $PublicDir "menu.js") "$User@$Server`:/var/www/zaixianyasuo.cn/public/"
Write-Host "  ✓ 网页文件上传完成" -ForegroundColor Green

# Step 3: Reload nginx
Write-Host "`n[3/3] 重载 Nginx..." -ForegroundColor Green
ssh "$User@$Server" "systemctl reload nginx"
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ⚠ Nginx 重载失败，请手动检查" -ForegroundColor Red
} else {
    Write-Host "  ✓ Nginx 重载成功" -ForegroundColor Green
}

# Verify
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  部署完成! 请验证以下 URL:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  下载页面: https://www.zaixianyasuo.cn/download.html" -ForegroundColor White
Write-Host "  首页:     https://www.zaixianyasuo.cn/" -ForegroundColor White
Write-Host "  App:      https://www.zaixianyasuo.cn/app/" -ForegroundColor White
Write-Host "  Windows:  https://www.zaixianyasuo.cn/download/imagecompress-setup.exe" -ForegroundColor White
Write-Host "  Android:  https://www.zaixianyasuo.cn/download/imagecompress.apk" -ForegroundColor White
