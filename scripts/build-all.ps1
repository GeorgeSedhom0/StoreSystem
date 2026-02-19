# build-all.ps1
# Full build orchestrator: prepare backend runtimes, build Electron app, create installer.

param(
    [switch]$SkipBackend,
    [switch]$SkipElectron
)

$ErrorActionPreference = "Stop"
$RootDir = "$PSScriptRoot\.."

Write-Host "=== OpenStore Full Build ===" -ForegroundColor Cyan
Write-Host "Root: $RootDir" -ForegroundColor Gray

# Step 1: Build backend runtimes (Python + PostgreSQL)
if (-not $SkipBackend) {
    Write-Host "`n--- Step 1: Building backend runtimes ---" -ForegroundColor Yellow
    try {
        & "$PSScriptRoot\build-backend.ps1"
    } catch {
        Write-Error "Backend build failed: $($_.Exception.Message)"
        exit 1
    }
} else {
    Write-Host "`n--- Step 1: Skipping backend build (--SkipBackend) ---" -ForegroundColor Yellow
}

# Step 2: Build Electron app
if (-not $SkipElectron) {
    Write-Host "`n--- Step 2: Building Electron app ---" -ForegroundColor Yellow
    Push-Location $RootDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Electron build failed"
            exit 1
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n--- Step 2: Skipping Electron build (--SkipElectron) ---" -ForegroundColor Yellow
}

# Step 3: Create Windows installer
Write-Host "`n--- Step 3: Creating Windows installer ---" -ForegroundColor Yellow
Push-Location $RootDir
try {
    npx electron-builder --win
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Installer build failed"
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "`n=== Build Complete ===" -ForegroundColor Green
Write-Host "Installer output: $RootDir\dist\" -ForegroundColor Gray
