#!/usr/bin/env bash
# Plain copy of the data + pictures into backups/manual_copy_<date>.   Close the application first.
# Run in Git Bash:   bash scripts/backup_data.sh
cd "$(dirname "$0")/.."
STAMP=$(date +%Y-%m-%d_%H%M%S)
DEST="backups/manual_copy_$STAMP"
mkdir -p "$DEST"
cp -r data "$DEST/data"
[ -d uploads ] && cp -r uploads "$DEST/uploads"
[ -d assets/logo ] && mkdir -p "$DEST/assets" && cp -r assets/logo "$DEST/assets/logo"
echo "Copied to $DEST"
