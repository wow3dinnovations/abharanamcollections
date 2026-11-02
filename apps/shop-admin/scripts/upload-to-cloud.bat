@echo off
REM ONE TIME: copy this computer's shop data to the online shop software (1gram.abharanamcollections.com/shop-admin).
REM Close the application first.
cd /d "%~dp0..\backend"
if not exist .venv\Scripts\python.exe (
  echo Please run scripts\setup.bat first.
  pause
  exit /b 1
)
.venv\Scripts\python.exe upload_to_cloud.py
pause
