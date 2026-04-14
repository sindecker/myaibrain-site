@echo off
title AIBrain Installer
echo.
echo   AIBrain Installer
echo   -----------------
echo.

where powershell >nul 2>&1
if errorlevel 1 (
    echo   ERROR: PowerShell is required but was not found.
    echo   Install it from https://aka.ms/pscore6
    pause
    exit /b 1
)

echo   Starting installer...
echo.
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://myaibrain.org/install.ps1 | iex"

if errorlevel 1 (
    echo.
    echo   Something went wrong. Check the message above.
    pause
    exit /b 1
)

pause
