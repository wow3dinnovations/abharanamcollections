#!/usr/bin/env bash
# Run every automatic test.   Run in Git Bash:   bash scripts/run_tests.sh
cd "$(dirname "$0")/../backend"
./.venv/Scripts/python.exe -m pytest -q "$@"
cd ../frontend && npm run build
