# AIBrain one-line installer (Windows PowerShell 5.1+ / PowerShell 7+)
#
# Usage:
#     irm https://myaibrain.org/install.ps1 | iex
#
# What it does (honestly):
#   1. Checks that a Python >= 3.10 is on PATH.
#   2. Creates an isolated venv at $env:USERPROFILE\.aibrain (override with $env:AIBRAIN_HOME).
#   3. pip installs / upgrades the `aibrain` package from PyPI.
#   4. Adds the venv Scripts dir to the *user* PATH so `aibrain` works in new shells.
#   5. Launches aibrain serve and opens the dashboard in your browser.

$ErrorActionPreference = 'Stop'

# --- UI helpers ---------------------------------------------------------------
$LOGO = @"

    ___  ___ ___          _
   / _ \|_ _| _ )_ _ __ _(_)_ __
  | (_) || || _ \ '_/ _`` | | '  \
   \___/|___|___/_| \__,_|_|_||_|

"@

function Show-Screen {
    param([string]$Status, [int]$Percent, [string]$Color = "Cyan")
    Clear-Host
    Write-Host $LOGO -ForegroundColor Cyan

    $width  = 36
    $filled = [math]::Round($width * $Percent / 100)
    $empty  = $width - $filled
    $bar    = "  [" + ([string][char]9608 * $filled) + ([string][char]9617 * $empty) + "]  $Percent%"
    Write-Host $bar -ForegroundColor $Color
    Write-Host ""
    Write-Host "  $Status" -ForegroundColor White
    Write-Host ""
}

function Die([string]$msg) {
    Clear-Host
    Write-Host $LOGO -ForegroundColor Cyan
    Write-Host "  [!!] $msg" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Visit https://myaibrain.org/docs/getting-started for help." -ForegroundColor Yellow
    Write-Host ""
    try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 8 }
    exit 1
}

# --- 1. Pick install dir ------------------------------------------------------
Show-Screen "Starting up..." 0

$AIBRAIN_HOME = if ($env:AIBRAIN_HOME) { $env:AIBRAIN_HOME } else { Join-Path $env:USERPROFILE ".aibrain" }
$VENV_DIR     = Join-Path $AIBRAIN_HOME "venv"
$VENV_PY      = Join-Path $VENV_DIR "Scripts\python.exe"
$VENV_CLI     = Join-Path $VENV_DIR "Scripts\aibrain.exe"

# --- 2. Python >= 3.10 --------------------------------------------------------
Show-Screen "Checking Python..." 10

$python = $null
foreach ($exe in @("python", "python3", "py")) {
    $cmd = Get-Command $exe -ErrorAction SilentlyContinue
    if (-not $cmd) { continue }
    try {
        $ver = & $cmd.Source -c "import sys;print('%d.%d'%sys.version_info[:2])" 2>$null
        if ($LASTEXITCODE -eq 0 -and $ver) {
            $parts = $ver.Trim().Split('.')
            if ([int]$parts[0] -eq 3 -and [int]$parts[1] -ge 10) {
                $python = $cmd.Source
                break
            }
        }
    } catch { }
}

if (-not $python) {
    Clear-Host
    Write-Host $LOGO -ForegroundColor Cyan
    Write-Host "  Python 3.10+ is required." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Install Python from https://python.org/downloads/" -ForegroundColor White
    Write-Host "  2. On the FIRST screen, check  'Add Python to PATH'" -ForegroundColor White
    Write-Host "  3. After install, double-click AIBrain-install.bat again" -ForegroundColor White
    Write-Host ""
    Start-Process "https://www.python.org/downloads/"
    Write-Host "  Opening Python download page..." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Press any key to close..." -ForegroundColor DarkGray
    try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 8 }
    exit 1
}

# --- 3. Create / reuse isolated venv ------------------------------------------
Show-Screen "Setting up environment..." 25

New-Item -ItemType Directory -Force -Path $AIBRAIN_HOME | Out-Null
if (-not (Test-Path $VENV_PY)) {
    & $python -m venv $VENV_DIR
    if ($LASTEXITCODE -ne 0) { Die "Could not create Python environment." }
}

# --- 4. pip install / upgrade aibrain -----------------------------------------
Show-Screen "Installing AIBrain from PyPI..." 45

& $VENV_PY -m pip install --quiet --upgrade pip 2>$null
& $VENV_PY -m pip install --quiet --upgrade aibrain 2>$null
if ($LASTEXITCODE -ne 0) { Die "Installation failed. Check your internet connection and try again." }

$version = "unknown"
try {
    $pipShow = & $VENV_PY -m pip show aibrain 2>$null
    foreach ($line in $pipShow) {
        if ($line -match '^Version:\s*(.+)$') { $version = $Matches[1].Trim(); break }
    }
} catch { }

if (-not (Test-Path $VENV_CLI)) { Die "AIBrain CLI not found after install — please try again." }

# --- 5. Add venv Scripts to user PATH -----------------------------------------
Show-Screen "Configuring PATH..." 65

$scriptsDir = Split-Path $VENV_CLI
$userPath   = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$scriptsDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$scriptsDir;$userPath", "User")
}
$env:Path = "$scriptsDir;$env:Path"

# --- 6. Run setup wizard ------------------------------------------------------
Show-Screen "Running setup..." 80

try {
    & $VENV_CLI setup --auto 2>$null | Out-Null
} catch { }

# --- 7. Launch dashboard ------------------------------------------------------
Show-Screen "Starting dashboard..." 90

try {
    Start-Process $VENV_CLI -ArgumentList "serve" -WindowStyle Normal

    $ready = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:8001" -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
            if ($r.StatusCode -lt 500) { $ready = $true; break }
        } catch { }
    }

    if ($ready) {
        Show-Screen "AIBrain $version is ready!" 100 "Green"
        Start-Process "http://localhost:8001"
        Write-Host "  Opening dashboard at http://localhost:8001" -ForegroundColor Green
        Write-Host "  Keep the server window open to stay running." -ForegroundColor DarkGray
    } else {
        Show-Screen "AIBrain $version installed." 100 "Green"
        Write-Host "  Start the dashboard: open a terminal and run  aibrain serve" -ForegroundColor Yellow
        Write-Host "  Then visit http://localhost:8001" -ForegroundColor Yellow
    }
} catch {
    Show-Screen "AIBrain $version installed." 100 "Green"
    Write-Host "  Start the dashboard: open a terminal and run  aibrain serve" -ForegroundColor Yellow
    Write-Host "  Then visit http://localhost:8001" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Upgrade anytime by re-running AIBrain-install.bat" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Press any key to close..." -ForegroundColor DarkGray
try { $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") } catch { Start-Sleep -Seconds 5 }
