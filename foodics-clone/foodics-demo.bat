@echo off
REM foodics-clone demo wrapper for Windows.
REM All real work is in the PowerShell scripts.
REM Usage:
REM   foodics-demo.bat start
REM   foodics-demo.bat stop
REM   foodics-demo.bat status
REM   foodics-demo.bat dev      (HMR mode, no tunnel)

setlocal
set ROOT=%~dp0

if /I "%1"=="start"  ( powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%start-demo.ps1" & exit /b %ERRORLEVEL% )
if /I "%1"=="stop"   ( powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%stop-demo.ps1"  & exit /b %ERRORLEVEL% )
if /I "%1"=="status" ( powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%status-demo.ps1" & exit /b %ERRORLEVEL% )
if /I "%1"=="dev"    (
    echo Starting in DEV mode (HMR, no tunnel) ...
    pushd "%ROOT%backend"
    start "foodics-backend" cmd /k "npm run dev"
    popd
    pushd "%ROOT%frontend"
    start "foodics-frontend" cmd /k "npm run dev"
    popd
    echo Backend  PID: see new window
    echo Frontend PID: see new window
    exit /b 0
)

if "%1"=="" (
    echo Usage: %~nx0 {start^|stop^|status^|dev}
    exit /b 1
)
echo Unknown command: %1
echo Usage: %~nx0 {start^|stop^|status^|dev}
exit /b 1
