@echo off
setlocal
set "RELEASE_ROOT=%~dp0"

rem Remove the browser-download mark from the bundled verifier only. This is
rem intentionally scoped to the release launcher directory and does not alter
rem the system execution policy.
pushd "%RELEASE_ROOT%launcher"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference = 'Stop'; Get-ChildItem -LiteralPath . -Filter '*.ps1' -File | Unblock-File"
set "UNBLOCK_STATUS=%errorlevel%"
popd
if not "%UNBLOCK_STATUS%"=="0" (
  echo.
  echo The release verifier could not be unblocked. If your organization requires all PowerShell scripts to be signed, contact IT or use an approved signed release.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%RELEASE_ROOT%launcher\verify-release.ps1" -ReleaseRoot "%RELEASE_ROOT:~0,-1%"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Release integrity verification succeeded.
