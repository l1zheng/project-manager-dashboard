@echo off
setlocal
set "RELEASE_ROOT=%~dp0"

powershell.exe -NoLogo -NoProfile -File "%RELEASE_ROOT%launcher\start-dashboard.ps1" -ReleaseRoot "%RELEASE_ROOT%" -StopOnly
if errorlevel 1 (
  echo.
  echo Project Manager Dashboard could not be stopped cleanly.
  pause
  exit /b 1
)
