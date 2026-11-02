@echo off
REM START THE APPLICATION (double-click this file). Keep this black window open while you work.
cd /d "%~dp0..\backend"
if not exist .venv\Scripts\python.exe (
  echo Please run scripts\setup.bat first.
  pause
  exit /b 1
)
.venv\Scripts\python.exe run.py
pause
