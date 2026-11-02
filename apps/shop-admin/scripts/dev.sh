#!/usr/bin/env bash
# FOR DEVELOPERS: backend with auto-reload on http://localhost:8000 and the live screen server on http://localhost:5173
# Run in Git Bash:   bash scripts/dev.sh
cd "$(dirname "$0")/.."
( cd backend && ./.venv/Scripts/python.exe -m uvicorn app.main:get_app --factory --reload --host 127.0.0.1 --port 8000 ) &
BACK=$!
trap "kill $BACK 2>/dev/null" EXIT
cd frontend && npm run dev
