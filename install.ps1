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
#   5. Idempotent — re-running upgrades in place.
#
# It does NOT:
#   - Install Python for you.
#   - Modify machine-wide PATH or any system-Python site-packages.
#   - Run `aibrain setup` automatically.

$ErrorActionPreference = 'Stop'

function Say([string]$msg)  { Write-Host ("  " + $msg) }
function Die([string]$msg)  { Write-Host ("  ERROR: " + $msg) -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  AIBrain installer"
Write-Host "  -----------------"
Write-Host ""

# --- 1. Pick install dir -----------------------------------------------------
$AIBRAIN_HOME = if ($env:AIBRAIN_HOME) { $env:AIBRAIN_HOME } else { Join-Path $env:USERPROFILE ".aibrain" }
$VENV_DIR     = Join-Path $AIBRAIN_HOME "venv"
$VENV_PY      = Join-Path $VENV_DIR "Scripts\python.exe"
$VENV_CLI     = Join-Path $VENV_DIR "Scripts\aibrain.exe"

# --- 2. Python >= 3.10 -------------------------------------------------------
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
                Say "Python: $python ($ver)"
                break
            }
        }
    } catch { }
}
if (-not $python) {
    Die "Python 3.10+ not found on PATH. Install from https://python.org/downloads/ then rerun."
}

# --- 3. Create / reuse isolated venv -----------------------------------------
New-Item -ItemType Directory -Force -Path $AIBRAIN_HOME | Out-Null
if (Test-Path $VENV_PY) {
    Say "Reusing venv at $VENV_DIR"
} else {
    Say "Creating venv at $VENV_DIR"
    & $python -m venv $VENV_DIR
    if ($LASTEXITCODE -ne 0) { Die "venv creation failed." }
}

# --- 4. pip install / upgrade aibrain ----------------------------------------
Say "Installing aibrain from PyPI..."
& $VENV_PY -m pip install --quiet --upgrade pip
& $VENV_PY -m pip install --quiet --upgrade aibrain
if ($LASTEXITCODE -ne 0) { Die "pip install aibrain failed." }

# Query installed version via pip (avoids importing aibrain, which can write
# harmless warnings to stderr and trip $ErrorActionPreference='Stop').
$version = "unknown"
try {
    $pipShow = & $VENV_PY -m pip show aibrain 2>$null
    foreach ($line in $pipShow) {
        if ($line -match '^Version:\s*(.+)$') { $version = $Matches[1].Trim(); break }
    }
} catch { }
Say ("Installed aibrain " + $version)

if (-not (Test-Path $VENV_CLI)) { Die "aibrain CLI missing at $VENV_CLI after install." }

# --- 5. Add venv Scripts to user PATH ---------------------------------------
$scriptsDir = Split-Path $VENV_CLI
$userPath   = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$scriptsDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$scriptsDir;$userPath", "User")
    Say "Added $scriptsDir to user PATH (new shells will pick it up)."
} else {
    Say "$scriptsDir already on user PATH."
}
# Also update current session
$env:Path = "$scriptsDir;$env:Path"

# --- 6. Run setup wizard automatically ---------------------------------------
Say "Running aibrain setup..."
Write-Host ""
try {
    & $VENV_CLI setup --auto
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  NOTE: Setup wizard exited with warnings. Run 'aibrain setup' to complete configuration." -ForegroundColor Yellow
    }
} catch {
    Write-Host "  NOTE: Could not run setup automatically. Run 'aibrain setup' to complete configuration." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Ready. Start AIBrain:"
Write-Host "      aibrain serve      # dashboard at http://localhost:8001"
Write-Host ""
Write-Host "  Upgrade any time by re-running this installer."
Write-Host ""
