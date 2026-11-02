@echo off
REM ONE-TIME SET-UP (double-click, or run in CMD).  Needs Python 3.11+ and Node.js installed.
cd /d "%~dp0.."
echo == Creating the Python environment
cd backend
if not exist .venv\Scripts\python.exe python -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
echo == Installing and building the screens
cd frontend
call npm install
call npm run build
cd ..
echo.
echo Set-up finished. Start the application by double-clicking scripts\start.bat
pause
