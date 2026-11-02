"""Backup and restore of the JSON data files.

A backup is a folder  backups/backup_2026-09-19_103000/  holding a copy of every data
file plus a small ``manifest.json`` (date, reason, who, files, record counts).
"""
from __future__ import annotations

import json
import logging
import re
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

from app.core.config import APP_VERSION
from app.core.errors import AppError, Conflict, NotFound, StorageError, ValidationFailed
from app.storage.json_store import JsonStore
from app.utils.dates import now_iso

log = logging.getLogger("abharanam.backup")

NAME_RE = re.compile(r"^backup_\d{4}-\d{2}-\d{2}_\d{6}(_\d+)?$")
KINDS = {"manual", "auto", "pre-restore", "pre-import", "pre-demo", "startup"}


class BackupManager:
    def __init__(self, store: JsonStore, backup_dir: Path):
        self.store = store
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ create
    def create(self, kind: str = "manual", reason: str = "", user: str = "") -> dict:
        with self.store._lock:
            stamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
            name, n = f"backup_{stamp}", 1
            while (self.backup_dir / name).exists():
                n += 1
                name = f"backup_{stamp}_{n}"
            target = self.backup_dir / name
            target.mkdir(parents=True)
            files = []
            try:
                status = self.store.status()
                for spec_name, spec in self.store.specs.items():
                    src = self.store.path(spec_name)
                    if not src.exists():
                        continue
                    dst = target / spec.filename
                    shutil.copy2(src, dst)
                    st = status.get(spec_name)
                    files.append({"name": spec.filename, "size": dst.stat().st_size,
                                  "records": st.records if st and st.state != "corrupted" else None,
                                  "state": st.state if st else "ok"})
                manifest = {"name": name, "created_at": now_iso(), "kind": kind if kind in KINDS else "manual",
                            "reason": reason, "created_by": user, "app_version": APP_VERSION,
                            "files": files, "total_size": sum(f["size"] for f in files)}
                (target / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            except Exception as exc:
                shutil.rmtree(target, ignore_errors=True)
                raise StorageError(f"Backup failed: {exc}")
            log.info("Backup created: %s (%s)", name, kind)
            return manifest

    # ------------------------------------------------------------------ list / inspect
    def _dir(self, name: str) -> Path:
        if not NAME_RE.match(name or ""):
            raise ValidationFailed("Invalid backup name.")
        d = (self.backup_dir / name).resolve()
        if d.parent != self.backup_dir.resolve() or not d.is_dir():
            raise NotFound("That backup was not found.")
        return d

    def _manifest(self, d: Path) -> dict:
        mf = d / "manifest.json"
        try:
            return json.loads(mf.read_text(encoding="utf-8"))
        except Exception:
            files = [{"name": p.name, "size": p.stat().st_size, "records": None, "state": "unknown"}
                     for p in sorted(d.glob("*.json")) if p.name != "manifest.json"]
            created = datetime.fromtimestamp(d.stat().st_mtime).isoformat(timespec="seconds")
            return {"name": d.name, "created_at": created, "kind": "manual", "reason": "(no manifest)",
                    "created_by": "", "app_version": "", "files": files,
                    "total_size": sum(f["size"] for f in files)}

    def list(self) -> list[dict]:
        out = []
        for d in self.backup_dir.iterdir():
            if d.is_dir() and NAME_RE.match(d.name):
                out.append(self._manifest(d))
        out.sort(key=lambda m: m["created_at"], reverse=True)
        return out

    def get(self, name: str) -> dict:
        return self._manifest(self._dir(name))

    def last(self) -> dict | None:
        items = self.list()
        return items[0] if items else None

    def validate(self, name: str) -> list[str]:
        """Return a list of problems (empty = backup is usable)."""
        d = self._dir(name)
        problems = []
        found = 0
        for spec in self.store.specs.values():
            f = d / spec.filename
            if not f.exists():
                continue
            found += 1
            try:
                raw = json.loads(f.read_text(encoding="utf-8-sig"))
                key = "data" if spec.kind == "doc" else "records"
                if isinstance(raw, dict) and key not in raw:
                    problems.append(f"{spec.filename}: missing '{key}'")
                elif isinstance(raw, list) and spec.kind == "doc":
                    problems.append(f"{spec.filename}: wrong structure")
            except Exception as exc:
                problems.append(f"{spec.filename}: cannot be read ({exc})")
        if found == 0:
            problems.append("The backup contains no data files.")
        return problems

    # ------------------------------------------------------------------ restore
    def restore(self, name: str, user: str = "") -> dict:
        d = self._dir(name)
        problems = self.validate(name)
        if problems:
            raise Conflict("This backup is damaged and cannot be restored: " + "; ".join(problems))
        safety = self.create("pre-restore", f"Automatic safety backup before restoring {name}", user)
        try:
            self.store.replace_all_from(d)
        except Exception as exc:
            log.exception("Restore failed")
            # put the safety backup back
            try:
                self.store.replace_all_from(self.backup_dir / safety["name"])
            except Exception:  # pragma: no cover
                pass
            raise StorageError(f"Restore failed and your previous data was kept: {exc}")
        log.warning("Backup %s restored by %s", name, user)
        return {"restored": name, "safety_backup": safety["name"]}

    # ------------------------------------------------------------------ housekeeping
    def prune_auto(self, keep: int) -> int:
        """Delete the oldest AUTOMATIC backups beyond ``keep``.  Manual/safety backups are never deleted."""
        autos = [m for m in self.list() if m.get("kind") in ("auto", "startup")]
        removed = 0
        for m in autos[keep:]:
            shutil.rmtree(self.backup_dir / m["name"], ignore_errors=True)
            removed += 1
        return removed

    def count(self) -> int:
        return len(self.list())

    def export_zip(self, dest: Path, extra_dirs: dict[str, Path]) -> Path:
        """Zip of all data files + given folders (uploads, logo) for moving to another computer."""
        dest.parent.mkdir(parents=True, exist_ok=True)
        with self.store._lock, zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
            for spec_name, spec in self.store.specs.items():
                p = self.store.path(spec_name)
                if p.exists():
                    zf.write(p, f"data/{spec.filename}")
            for arc, folder in extra_dirs.items():
                if not folder.exists():
                    continue
                for p in folder.rglob("*"):
                    if p.is_file() and p.name != ".gitkeep":
                        zf.write(p, f"{arc}/{p.relative_to(folder).as_posix()}")
            zf.writestr("README.txt",
                        "ABHARANAM COLLECTIONS data export.\n"
                        "To move to another computer: copy the 'data' folder (and 'uploads') "
                        "into the same places in the application folder while the app is closed.\n")
        return dest
