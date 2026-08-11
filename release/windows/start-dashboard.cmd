@echo off
setlocal
set "RELEASE_ROOT=%~dp0"
"%RELEASE_ROOT%runtime\node.exe" "%RELEASE_ROOT%launcher\launcher.mjs" --start
if errorlevel 1 (
  echo.
  echo Project Manager Dashboard could not be started. Review the message above and the logs under Local AppData.
  if /I not "%CI%"=="true" pause
  exit /b 1
)
