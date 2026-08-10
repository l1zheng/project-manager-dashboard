@echo off
setlocal
set "RELEASE_ROOT=%~dp0"

rem A browser-downloaded ZIP can propagate its Zone.Identifier to these local
rem launcher scripts. Remove only that mark before invoking them; this does
rem not change the machine or user execution policy.
pushd "%RELEASE_ROOT%launcher"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference = 'Stop'; Get-ChildItem -LiteralPath . -Filter '*.ps1' -File | Unblock-File"
set "UNBLOCK_STATUS=%errorlevel%"
popd
if not "%UNBLOCK_STATUS%"=="0" (
  echo.
  echo The Windows launcher scripts could not be unblocked. If your organization requires all PowerShell scripts to be signed, contact IT or use an approved signed release.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%RELEASE_ROOT%launcher\verify-release.ps1" -ReleaseRoot "%RELEASE_ROOT:~0,-1%" -Quiet
if errorlevel 1 (
  echo.
  echo Release integrity verification failed. The application was not started.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%RELEASE_ROOT%launcher\start-dashboard.ps1" -ReleaseRoot "%RELEASE_ROOT:~0,-1%"
if errorlevel 1 (
  echo.
  echo Project Manager Dashboard could not be started. Review the message above and the logs under Local AppData.
  pause
  exit /b 1
)
