#!/usr/bin/env bash
# ONE-TIME SET-UP.   Run in Git Bash from the project folder:   bash scripts/setup.sh
set -e
cd "$(dirname "$0")/.."

echo "== 1/4  Checking Python and Node.js"
python --version || { echo "Python is not installed. Install Python 3.11 or newer from python.org"; exit 1; }
node --version   || { echo "Node.js is not installed. Install the LTS version from nodejs.org"; exit 1; }

echo "== 2/4  Creating the Python environment (backend/.venv)"
cd backend
[ -d .venv ] || python -m venv .venv
./.venv/Scripts/python.exe -m pip install --upgrade pip
./.venv/Scripts/python.exe -m pip install -r requirements.txt
cd ..

echo "== 3/4  Installing the screen (frontend) packages"
cd frontend
npm install
echo "== 4/4  Building the screens"
npm run build
cd ..

echo
echo "Set-up finished.  Start the application with:   bash scripts/start.sh"
