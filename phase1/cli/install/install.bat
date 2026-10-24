@echo off
rem Somnia CLI installer for Windows. Runs install.ps1 hidden, no prompts.
rem Usage: install.bat [-Version vX.Y.Z] [-Prefix DIR] [-NoPath]
rem Unattended: start /min "" install.bat   (output goes to %TEMP%\somnia-install.log when no console is attached)
setlocal
set "PS1=%~dp0install.ps1"
if not exist "%PS1%" (
  echo install.ps1 must sit next to install.bat 1>&2
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PS1%" %* > "%TEMP%\somnia-install.log" 2>&1
set "RC=%ERRORLEVEL%"
type "%TEMP%\somnia-install.log"
exit /b %RC%
