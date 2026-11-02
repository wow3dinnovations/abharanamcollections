# Backup and restore

## What a backup is
A folder like `backups/backup_2026-09-19_103000/` containing a copy of every file in `data/` plus `manifest.json` (date/time, who, why, how many records per file).
Pictures/receipts are not copied into each backup (they rarely change) — use **Export all data (zip)** or copy `uploads/` yourself.

## Kinds of backups
| Kind | When |
|---|---|
| **Manual** | You press **Backup Now** |
| **Automatic** | On start-up (if the last backup is older than 12 hours) and every 12 hours while running. The newest **30** are kept; older automatic ones are removed. |
| **Safety (before restore / import / demo)** | Made automatically before anything risky. **Never deleted automatically.** |

Change the interval/count in `backend/.env` (`AUTO_BACKUP_HOURS`, `AUTO_BACKUP_KEEP`).

## Making a backup
*Administration → Backup & Restore → Backup Now.* The page also shows how many records each backup holds.

## Restoring
1. *Administration → Backup & Restore →* choose the backup → **View / Restore**.
2. Read the **date/time** and the **list of files/records**.
3. Type **RESTORE** and confirm.
4. The software first saves your **current** data as a *safety backup*, then swaps in the old files. A damaged backup is refused.
5. Everything entered after that backup's time disappears from the app — but it is still in the safety backup (restore *that* to undo).

After a restore everyone is asked to sign in again if the user list changed.

## Also keep copies outside this computer
Copy the `backups` folder to a pen drive / another disk weekly. If the computer is lost, an on-the-same-disk backup is lost too.

## Manual copy (application closed)
`bash scripts/backup_data.sh` → copies `data`, `uploads`, logo to `backups/manual_copy_<date>`. To restore by hand: close the app, copy the folders back.

## If a file is corrupted
See `troubleshooting.md`: restore the newest backup from the Backup page (the rest of the app still works while one file is damaged).
