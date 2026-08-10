@echo off
setlocal
set "RELEASE_ROOT=%~dp0"

rem See start-dashboard.cmd for why this is limited to the bundled launcher
rem scripts and does not change the system execution policy.
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

powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%RELEASE_ROOT%launcher\start-dashboard.ps1" -ReleaseRoot "%RELEASE_ROOT:~0,-1%" -StopOnly
if errorlevel 1 (
  echo.
  echo Project Manager Dashboard could not be stopped cleanly.
  pause
  exit /b 1
)
