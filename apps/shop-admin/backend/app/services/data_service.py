"""Data Management: summary, backups, restore, export-all."""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timedelta

from app.core.context import AppContext
from app.core.errors import Forbidden, ValidationFailed
from app.services import audit_service
from app.utils.dates import now_iso

log = logging.getLogger("abharanam.data")


def summary(ctx: AppContext) -> dict:
    store = ctx.store
    status = store.status()

    def n(name: str) -> int | None:
        try:
            return len(store.all(name))
        except Exception:
            return None

    last = ctx.backups.last()
    bad = [m.name + ".json" for m in status.values() if m.state == "corrupted"]
    created = [m.name + ".json" for m in status.values() if m.state == "created"]
    return {
        "data_folder": str(ctx.settings.data_dir),
        "backup_folder": str(ctx.settings.backup_dir),
        "export_folder": str(ctx.settings.exports_dir),
        "counts": {k: n(k) for k in ("products", "sales", "purchases", "expenses", "customers",
                                     "vendors", "locations", "inventory_transactions", "users")},
        "last_backup": last,
        "backup_count": ctx.backups.count(),
        "health": "corrupted" if bad else ("warning" if created or store.recovered_from_crash else "ok"),
        "corrupted_files": bad,
        "recreated_files": created,
        "recovery_notice": store.recovered_from_crash,
        "files": [{"file": m.name + ".json", "state": m.state, "records": m.records,
                   "revision": m.revision, "updated_at": m.updated_at} for m in status.values()],
    }


def backup_now(ctx: AppContext, user: dict, reason: str = "") -> dict:
    manifest = ctx.backups.create("manual", reason or "Backup Now button", user.get("username", ""))
    audit_service.log_now(ctx, user, "BACKUP_CREATED", "backup", manifest["name"], reason or "Manual backup")
    return manifest


def restore(ctx: AppContext, user: dict, name: str, confirm: bool, confirm_text: str) -> dict:
    if not confirm or confirm_text.strip().upper() != "RESTORE":
        raise ValidationFailed("Please confirm the restore by typing RESTORE. Nothing was changed.")
    ctx.backups.get(name)   # 404 if unknown
    result = ctx.backups.restore(name, user.get("username", ""))
    # the restored users.json might not contain this admin - the audit entry is best-effort
    try:
        audit_service.log_now(ctx, user, "BACKUP_RESTORED", "backup", name,
                              f"Restored. Safety copy of previous data: {result['safety_backup']}")
    except Exception:  # pragma: no cover
        log.exception("could not write restore audit entry")
    return result


def open_folder(ctx: AppContext, which: str, client_host: str) -> str:
    """Open the exports / backups / data folder in Windows Explorer (only from this computer)."""
    if client_host not in ("127.0.0.1", "::1", "localhost", "testclient"):
        raise Forbidden("Folders can only be opened from the computer that runs the application.")
    folders = {"exports": ctx.settings.exports_dir, "backups": ctx.settings.backup_dir,
               "data": ctx.settings.data_dir, "invoices": ctx.settings.invoices_dir}
    if which not in folders:
        raise ValidationFailed("Unknown folder.")
    path = folders[which]
    if hasattr(os, "startfile") and client_host != "testclient":
        os.startfile(str(path))          # noqa: S606 - fixed whitelisted folder
    else:
        raise ValidationFailed(f"Automatic opening is only available on Windows. The folder is: {path}")
    return str(path)


# ------------------------------------------------------------------ automatic backups
class AutoBackup:
    """Background thread: makes a backup on start-up (if the last one is old) and then every few hours."""

    def __init__(self, ctx: AppContext):
        self.ctx = ctx
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="auto-backup", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def run_once(self) -> dict | None:
        ctx = self.ctx
        if ctx.settings.auto_backup_hours <= 0 or not ctx.store.all("users"):
            return None
        last = ctx.backups.last()
        if last:
            try:
                age = datetime.now() - datetime.fromisoformat(last["created_at"])
                if age < timedelta(hours=ctx.settings.auto_backup_hours):
                    return None
            except ValueError:
                pass
        m = ctx.backups.create("auto", "Automatic backup")
        ctx.backups.prune_auto(ctx.settings.auto_backup_keep)
        return m

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.run_once()
            except Exception:
                log.exception("automatic backup failed")
            self._stop.wait(1800)
