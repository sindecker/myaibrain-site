@echo off
title AIBrain Installer
echo.
echo   AIBrain Installer
echo   -----------------
echo.

:: Check for PowerShell (required)
where powershell >nul 2>&1
if errorlevel 1 (
    echo   ERROR: PowerShell is required. Install it from https://aka.ms/pscore6
    pause
    exit /b 1
)

:: Check for Python 3.10+
set PYTHON_OK=0
for %%P in (python python3 py) do (
    if !PYTHON_OK!==0 (
        %%P -c "import sys; exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1
        if not errorlevel 1 set PYTHON_OK=1
    )
)

if %PYTHON_OK%==0 (
    echo   Python 3.10 or later is required.
    echo   Opening download page...
    start https://www.python.org/downloads/
    echo.
    echo   After installing Python, run this file again.
    pause
    exit /b 1
)

echo   Installing AIBrain...
echo.
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://myaibrain.org/install.ps1 | iex"

if errorlevel 1 (
    echo.
    echo   Install failed. Check the messages above or visit https://myaibrain.org/docs/getting-started
    pause
    exit /b 1
)

echo.
echo   Done. Type 'aibrain serve' to start the dashboard.
echo.
pause
