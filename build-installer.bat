@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-windows.ps1" -Target installer
set "CONCORD_BUILD_RESULT=%ERRORLEVEL%"
if not "%CONCORD_BUILD_NO_PAUSE%"=="1" pause
exit /b %CONCORD_BUILD_RESULT%
