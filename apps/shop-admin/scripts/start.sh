#!/usr/bin/env bash
# START THE APPLICATION.   Run in Git Bash from the project folder:   bash scripts/start.sh
cd "$(dirname "$0")/.."
if [ ! -f backend/.venv/Scripts/python.exe ]; then
  echo "Please run the one-time set-up first:   bash scripts/setup.sh"
  exit 1
fi
cd backend
./.venv/Scripts/python.exe run.py "$@"
