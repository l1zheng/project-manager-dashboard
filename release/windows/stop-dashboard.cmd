@echo off
setlocal
set "RELEASE_ROOT=%~dp0"
"%RELEASE_ROOT%runtime\node.exe" "%RELEASE_ROOT%launcher\launcher.mjs" --stop
if errorlevel 1 (
  echo.
  echo Project Manager Dashboard could not be stopped cleanly.
  if /I not "%CI%"=="true" pause
  exit /b 1
)
