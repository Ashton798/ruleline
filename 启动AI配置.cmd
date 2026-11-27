@echo off
chcp 65001 >nul
set "RULELINE_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%RULELINE_ROOT%start-ai.ps1"
echo.
pause
