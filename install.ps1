#Requires -Version 5.1
<#
.SYNOPSIS
    One-command aibrain installer for Windows.

.DESCRIPTION
    Detects Python (3.10+), installs aibrain via pip, adds the Scripts directory
    to the user PATH (HKCU -- no admin required), and verifies aibrain runs in the
    current session.

.PARAMETER Auto
    If set, runs 'aibrain setup --yes' automatically after install.

.EXAMPLE
    irm https://raw.githubusercontent.com/DeckerOps/aibrain/main/scripts/install.ps1 | iex

.EXAMPLE
    # With auto-setup flag (pass via env since iex cannot receive params directly):
    $env:AIBRAIN_AUTO_SETUP = "1"
    irm https://raw.githubusercontent.com/DeckerOps/aibrain/main/scripts/install.ps1 | iex
#>

param(
    [switch]$Auto
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

function Write-Step {
    param([string]$msg)
    Write-Host "`n>>> $msg" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$msg)
    Write-Host "    [OK] $msg" -ForegroundColor Green
}

function Write-Warn {
    param([string]$msg)
    Write-Host "    [!]  $msg" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$msg)
    Write-Host "`n[FAIL] $msg" -ForegroundColor Red
}

# Parse version string "3.11.4" -> [int, int, int]
function Get-PythonVersion {
    param([string]$exe)
    try {
        $raw = & $exe --version 2>&1
        if ($raw -match '(\d+)\.(\d+)\.(\d+)') {
            return @([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
        }
    } catch { }
    return $null
}

function Test-Version310 {
    param($ver)
    if ($null -eq $ver) { return $false }
    if ($ver[0] -gt 3) { return $true }
    if ($ver[0] -eq 3 -and $ver[1] -ge 10) { return $true }
    return $false
}

# --------------------------------------------------------------------------- #
# STEP 1: Detect Python 3.10+
# --------------------------------------------------------------------------- #

Write-Step "Detecting Python 3.10+ ..."

$pythonExe = $null
$candidates = @('py', 'python', 'python3')

foreach ($cand in $candidates) {
    $ver = Get-PythonVersion $cand
    if (Test-Version310 $ver) {
        $pythonExe = $cand
        Write-Ok "Found: '$cand' (Python $($ver[0]).$($ver[1]).$($ver[2]))"
        break
    } elseif ($null -ne $ver) {
        Write-Warn "'$cand' found but version $($ver[0]).$($ver[1]).$($ver[2]) is below 3.10 -- skipping"
    }
}

if ($null -eq $pythonExe) {
    Write-Step "Python 3.10+ not found. Installing via winget ..."

    $wingetExe = Get-Command winget -ErrorAction SilentlyContinue
    if ($null -eq $wingetExe) {
        Write-Fail "winget is not available on this machine."
        Write-Host ""
        Write-Host "  Please install Python 3.11+ manually:" -ForegroundColor Yellow
        Write-Host "    https://www.python.org/downloads/" -ForegroundColor White
        Write-Host ""
        Write-Host "  Then re-run this installer." -ForegroundColor Yellow
        exit 1
    }

    try {
        & winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { throw "winget exited with code $LASTEXITCODE" }
    } catch {
        $errMsg = $_.ToString()
        Write-Fail "winget install failed: $errMsg"
        Write-Host "  Manual download: https://www.python.org/downloads/" -ForegroundColor Yellow
        exit 1
    }

    # Refresh PATH so the newly installed python is visible in this session
    $machinePath = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine')
    $userPath    = [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    $env:PATH = "$machinePath;$userPath"

    # Re-detect after install
    foreach ($cand in $candidates) {
        $ver = Get-PythonVersion $cand
        if (Test-Version310 $ver) {
            $pythonExe = $cand
            Write-Ok "Now found: '$cand' (Python $($ver[0]).$($ver[1]).$($ver[2]))"
            break
        }
    }

    if ($null -eq $pythonExe) {
        Write-Fail "Python was installed but is still not on PATH."
        Write-Host "  Please open a new terminal and re-run this installer." -ForegroundColor Yellow
        exit 1
    }
}

# --------------------------------------------------------------------------- #
# STEP 2: pip install aibrain
# --------------------------------------------------------------------------- #

Write-Step "Installing aibrain via pip ..."

try {
    & $pythonExe -m pip install -U aibrain
    if ($LASTEXITCODE -ne 0) { throw "pip exited with code $LASTEXITCODE" }
    Write-Ok "pip install succeeded"
} catch {
    $errMsg = $_.ToString()
    Write-Fail "pip install failed: $errMsg"
    Write-Host ""
    Write-Host "  Try manually:" -ForegroundColor Yellow
    Write-Host "    $pythonExe -m pip install -U aibrain" -ForegroundColor White
    Write-Host ""
    Write-Host "  If pip is missing:" -ForegroundColor Yellow
    Write-Host "    $pythonExe -m ensurepip --upgrade" -ForegroundColor White
    exit 1
}

# --------------------------------------------------------------------------- #
# STEP 3: Locate Scripts directory
# --------------------------------------------------------------------------- #

Write-Step "Locating Python Scripts directory ..."

$scriptsDir = $null
try {
    $scriptsDir = (& $pythonExe -c "import sysconfig; print(sysconfig.get_path('scripts'))").Trim()
    Write-Ok "Scripts dir: $scriptsDir"
} catch {
    $errMsg = $_.ToString()
    Write-Fail "Could not determine Scripts directory: $errMsg"
    exit 1
}

if (-not (Test-Path $scriptsDir)) {
    Write-Warn "Scripts dir not found at: $scriptsDir"
    Write-Warn "This may resolve itself -- continuing."
}

# --------------------------------------------------------------------------- #
# STEP 4: Add Scripts dir to user PATH
# --------------------------------------------------------------------------- #

Write-Step "Updating user PATH ..."

$currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $currentPath) { $currentPath = '' }

# Split on semicolons, trim, drop empty entries, compare case-insensitively
$pathParts    = $currentPath -split ';' | Where-Object { $_.Trim() -ne '' }
$alreadyThere = $pathParts | Where-Object { $_.TrimEnd('\') -ieq $scriptsDir.TrimEnd('\') }

if ($alreadyThere) {
    Write-Ok "Scripts dir already in user PATH -- no change needed"
} else {
    $newPath = ($pathParts + $scriptsDir) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Ok "Added to user PATH (HKCU\Environment\Path)"
}

# Refresh current session so aibrain is usable immediately
if ($env:PATH -notlike "*$scriptsDir*") {
    $env:PATH = $env:PATH.TrimEnd(';') + ";$scriptsDir"
    Write-Ok "Refreshed current session PATH"
}

# --------------------------------------------------------------------------- #
# STEP 5: Verify aibrain command
# --------------------------------------------------------------------------- #

Write-Step "Verifying aibrain installation ..."

$aibrainExe = Join-Path $scriptsDir 'aibrain.exe'
$verified   = $false

try {
    $versionOut = & aibrain --version 2>&1
    if ($LASTEXITCODE -eq 0 -or ($versionOut -match '\d+\.\d+')) {
        Write-Ok "aibrain --version: $versionOut"
        $verified = $true
    }
} catch { }

if (-not $verified -and (Test-Path $aibrainExe)) {
    try {
        $versionOut = & $aibrainExe --version 2>&1
        if ($LASTEXITCODE -eq 0 -or ($versionOut -match '\d+\.\d+')) {
            Write-Ok "aibrain --version (full path): $versionOut"
            $verified = $true
        }
    } catch { }
}

if (-not $verified) {
    Write-Warn "Could not invoke 'aibrain --version' in this session."
    Write-Host ""
    Write-Host "  aibrain IS installed. Run via full path until you open a new shell:" -ForegroundColor Yellow
    Write-Host "    $aibrainExe" -ForegroundColor White
    Write-Host ""
    Write-Host "  Or open a new terminal and run:" -ForegroundColor Yellow
    Write-Host "    aibrain setup" -ForegroundColor White
}

# --------------------------------------------------------------------------- #
# STEP 6: Optional auto-setup
# --------------------------------------------------------------------------- #

$runSetup = $Auto -or ($env:AIBRAIN_AUTO_SETUP -eq '1')

if ($runSetup) {
    Write-Step "Running aibrain setup --yes ..."
    try {
        if ($verified) {
            & aibrain setup --yes
        } else {
            & $aibrainExe setup --yes
        }
    } catch {
        $errMsg = $_.ToString()
        Write-Warn "Setup encountered an issue: $errMsg"
        Write-Host "  Run manually: aibrain setup" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "  Run 'aibrain setup' to complete installation." -ForegroundColor Cyan
}

# --------------------------------------------------------------------------- #
# Done
# --------------------------------------------------------------------------- #

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  aibrain installed successfully!" -ForegroundColor Green
if ($verified) {
    Write-Host "  'aibrain' command is ready in this shell." -ForegroundColor Green
} else {
    Write-Host "  Open a new terminal to use the 'aibrain' command." -ForegroundColor Green
}
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
