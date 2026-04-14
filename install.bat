@echo off
setlocal enabledelayedexpansion
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

:: Refresh PATH from registry so newly-installed Python is found
:: (Windows installer updates registry but not the current shell session)
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USER_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%B"
if defined USER_PATH (
    set "PATH=%SYS_PATH%;%USER_PATH%"
) else (
    set "PATH=%SYS_PATH%"
)

:: Check for Python 3.10+
set PYTHON_OK=0
set PYTHON_EXE=
for %%P in (python python3 py) do (
    if "!PYTHON_OK!"=="0" (
        %%P --version >nul 2>&1
        if not errorlevel 1 (
            %%P -c "import sys; exit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1
            if not errorlevel 1 (
                set PYTHON_OK=1
                set PYTHON_EXE=%%P
            )
        )
    )
)

if "!PYTHON_OK!"=="0" (
    echo   Python 3.10 or later is required.
    echo   Opening download page...
    echo.
    echo   IMPORTANT: When installing Python, check the box that says
    echo   "Add Python to PATH" on the first installer screen.
    echo.
    start https://www.python.org/downloads/
    echo   After installing Python, close this window and run the installer again.
    pause
    exit /b 1
)

echo   Python found. Installing AIBrain...
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
