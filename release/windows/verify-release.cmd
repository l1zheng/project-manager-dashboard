@echo off
setlocal
set "RELEASE_ROOT=%~dp0"

powershell.exe -NoLogo -NoProfile -File "%RELEASE_ROOT%launcher\verify-release.ps1" -ReleaseRoot "%RELEASE_ROOT%"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Release integrity verification succeeded.
