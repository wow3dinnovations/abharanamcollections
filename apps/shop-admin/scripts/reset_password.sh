#!/usr/bin/env bash
# Forgot the password?  CLOSE the application, then run in Git Bash:   bash scripts/reset_password.sh
cd "$(dirname "$0")/../backend"
./.venv/Scripts/python.exe reset_password.py
