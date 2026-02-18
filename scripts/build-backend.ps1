# build-backend.ps1
# Downloads and prepares Python embeddable + PostgreSQL portable for bundling with Electron.
# Output: backend-dist/ directory ready for electron-builder extraResources.
#
# Caching: Python and PostgreSQL runtimes are cached after first extraction.
# Only server files are re-copied every build. Use -Force to rebuild everything.

param(
    [string]$PythonVersion = "3.9.13",
    [string]$PostgresVersion = "17.2-1",
    [string]$OutputDir = "$PSScriptRoot\..\backend-dist",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

$PythonMajorMinor = $PythonVersion -replace '\.(\d+)$', ''
$PythonTag = $PythonVersion -replace '\.', ''
$PythonShortTag = ($PythonVersion.Split('.')[0..1]) -join ''

# URLs
$PythonUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
$PostgresUrl = "https://get.enterprisedb.com/postgresql/postgresql-$PostgresVersion-windows-x64-binaries.zip"

$DownloadDir = "$PSScriptRoot\..\backend-downloads"

function Download-File($Url, $Dest) {
    if (Test-Path $Dest) {
        Write-Host "  Already downloaded: $Dest"
        return
    }
    Write-Host "  Downloading: $Url"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
}

New-Item -ItemType Directory -Force -Path $DownloadDir -ErrorAction SilentlyContinue | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDir -ErrorAction SilentlyContinue | Out-Null

# ============================================================
# 1. Python Embeddable (cached)
# ============================================================
$PythonReady = "$OutputDir\python\.ready"
$NeedsPython = $Force -or -not (Test-Path $PythonReady)

if ($NeedsPython) {
    Write-Host "`n=== Preparing Python $PythonVersion Embeddable ===" -ForegroundColor Cyan

    if (Test-Path "$OutputDir\python") {
        Remove-Item -Recurse -Force "$OutputDir\python"
    }
    New-Item -ItemType Directory -Force -Path "$OutputDir\python" | Out-Null

    $PythonZip = "$DownloadDir\python-$PythonVersion-embed-amd64.zip"
    Download-File $PythonUrl $PythonZip

    Write-Host "  Extracting Python..."
    Expand-Archive -Path $PythonZip -DestinationPath "$OutputDir\python" -Force

    # Enable import site (required for pip to work in embedded Python)
    $PthFile = Get-ChildItem "$OutputDir\python" -Filter "python*._pth" | Select-Object -First 1
    if ($PthFile) {
        Write-Host "  Enabling import site in $($PthFile.Name)..."
        $content = Get-Content $PthFile.FullName
        $content = $content -replace '#import site', 'import site'
        Set-Content $PthFile.FullName $content
    }

    # Install pip
    $GetPipFile = "$DownloadDir\get-pip.py"
    Download-File $GetPipUrl $GetPipFile

    $PythonExe = "$OutputDir\python\python.exe"
    Write-Host "  Installing pip..."
    & $PythonExe $GetPipFile --no-warn-script-location 2>&1 | Write-Host

    # Install requirements
    $RequirementsFile = "$PSScriptRoot\..\server\requirements.txt"
    Write-Host "  Installing Python packages (this may take a few minutes)..."
    & $PythonExe -m pip install -r $RequirementsFile --only-binary :all: --no-warn-script-location --timeout 120 --retries 5 2>&1 | Write-Host

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install Python packages"
        exit 1
    }

    # Mark as ready
    Set-Content $PythonReady "python=$PythonVersion"
    Write-Host "  Python ready (cached for next build)" -ForegroundColor Green
} else {
    Write-Host "`n=== Python $PythonVersion === (cached, skipping)" -ForegroundColor Green
}

# ============================================================
# 2. PostgreSQL Portable (cached)
# ============================================================
$PgReady = "$OutputDir\pgsql\.ready"
$NeedsPg = $Force -or -not (Test-Path $PgReady)

if ($NeedsPg) {
    Write-Host "`n=== Preparing PostgreSQL $PostgresVersion Portable ===" -ForegroundColor Cyan

    if (Test-Path "$OutputDir\pgsql") {
        Remove-Item -Recurse -Force "$OutputDir\pgsql"
    }
    New-Item -ItemType Directory -Force -Path "$OutputDir\pgsql" | Out-Null

    $PgZip = "$DownloadDir\postgresql-$PostgresVersion-windows-x64-binaries.zip"
    Download-File $PostgresUrl $PgZip

    Write-Host "  Extracting PostgreSQL (this may take a minute)..."
    $TempPgDir = "$DownloadDir\pg-extract"
    if (Test-Path $TempPgDir) { Remove-Item -Recurse -Force $TempPgDir }
    Expand-Archive -Path $PgZip -DestinationPath $TempPgDir -Force

    # Copy only what we need (bin + lib + share) to keep size reasonable
    $PgSourceDir = "$TempPgDir\pgsql"
    Write-Host "  Copying PostgreSQL bin, lib, share..."
    Copy-Item -Recurse "$PgSourceDir\bin" "$OutputDir\pgsql\bin"
    Copy-Item -Recurse "$PgSourceDir\lib" "$OutputDir\pgsql\lib"
    Copy-Item -Recurse "$PgSourceDir\share" "$OutputDir\pgsql\share"

    # Clean up temp extraction
    Remove-Item -Recurse -Force $TempPgDir

    # Mark as ready
    Set-Content $PgReady "postgres=$PostgresVersion"
    Write-Host "  PostgreSQL ready (cached for next build)" -ForegroundColor Green
} else {
    Write-Host "`n=== PostgreSQL $PostgresVersion === (cached, skipping)" -ForegroundColor Green
}

# ============================================================
# 3. Server Python files (always re-copied)
# ============================================================
Write-Host "`n=== Copying server files ===" -ForegroundColor Cyan

$ServerSrc = "$PSScriptRoot\..\server"
$ServerDest = "$OutputDir\server"

# Clean and recreate server dir (always fresh - these are your code files)
if (Test-Path $ServerDest) {
    Remove-Item -Recurse -Force $ServerDest
}
New-Item -ItemType Directory -Force -Path $ServerDest | Out-Null

# Copy all Python files
Get-ChildItem "$ServerSrc\*.py" | ForEach-Object {
    Copy-Item $_.FullName "$ServerDest\"
    Write-Host "  Copied: $($_.Name)"
}

# Copy .env template if it exists
if (Test-Path "$ServerSrc\.env") {
    Copy-Item "$ServerSrc\.env" "$ServerDest\.env.template"
    Write-Host "  Copied: .env -> .env.template"
}

# Copy requirements.txt for reference
Copy-Item "$ServerSrc\requirements.txt" "$ServerDest\"

# ============================================================
# Summary
# ============================================================
Write-Host "`n=== Build Complete ===" -ForegroundColor Green

$PythonSize = (Get-ChildItem -Recurse "$OutputDir\python" | Measure-Object -Property Length -Sum).Sum / 1MB
$PgSize = (Get-ChildItem -Recurse "$OutputDir\pgsql" | Measure-Object -Property Length -Sum).Sum / 1MB
$ServerSize = (Get-ChildItem -Recurse "$OutputDir\server" | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host "  Python:     $([math]::Round($PythonSize, 1)) MB"
Write-Host "  PostgreSQL: $([math]::Round($PgSize, 1)) MB"
Write-Host "  Server:     $([math]::Round($ServerSize, 1)) MB"
Write-Host "  Total:      $([math]::Round($PythonSize + $PgSize + $ServerSize, 1)) MB"
Write-Host "`n  Output: $OutputDir"
Write-Host "  Tip: Use -Force to rebuild Python/PostgreSQL from scratch" -ForegroundColor Gray
