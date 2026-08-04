@echo off
setlocal
set "RELEASE_ROOT=%~dp0"

powershell.exe -NoLogo -NoProfile -File "%RELEASE_ROOT%launcher\verify-release.ps1" -ReleaseRoot "%RELEASE_ROOT%" -Quiet
if errorlevel 1 (
  echo.
  echo Release integrity verification failed. The application was not started.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -File "%RELEASE_ROOT%launcher\start-dashboard.ps1" -ReleaseRoot "%RELEASE_ROOT%"
if errorlevel 1 (
  echo.
  echo Project Manager Dashboard could not be started. Review the message above and the logs under Local AppData.
  pause
  exit /b 1
)
