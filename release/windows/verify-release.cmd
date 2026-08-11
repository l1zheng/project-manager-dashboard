@echo off
setlocal
set "RELEASE_ROOT=%~dp0"
"%RELEASE_ROOT%runtime\node.exe" "%RELEASE_ROOT%launcher\launcher.mjs" --check
if errorlevel 1 (
  if /I not "%CI%"=="true" pause
  exit /b 1
)
echo Release structure check succeeded.
