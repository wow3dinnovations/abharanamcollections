"""Safe local JSON storage engine.

Everything the business owns lives in plain JSON files inside the ``data`` folder.
This module is the ONLY place that reads or writes those files.

Safety design (important - this is real business data):

* Every file is written to a temporary file first, flushed to disk, re-read and
  verified, and only then swapped in with an atomic ``os.replace``.
* A ``Transaction`` can change many files (e.g. a sale touches products, sales,
  payments, inventory transactions, audit log).  All files are prepared and
  verified first.  A small journal file records the swap, and the previous
  version of every file is kept until the whole swap finished.  If anything
  fails - or the computer loses power in the middle - the previous consistent
  state is restored (automatically on next start-up).
* Committed data is treated as immutable snapshots.  Readers never see a
  half-finished transaction.
* A file that cannot be parsed is flagged as CORRUPTED and is never overwritten;
  the rest of the app keeps working and the admin is told to restore a backup.
* A file that is missing is re-created empty (with a warning in Data Health).
* A cross-process lock file stops two copies of the app from writing at once.
"""
from __future__ import annotations

import copy
import json
import logging
import os
import shutil
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterator

from filelock import FileLock, Timeout

try:                                   # orjson is ~10x faster; the plain json module is the fallback
    import orjson
except ImportError:                    # pragma: no cover
    orjson = None

from app.core.errors import DataCorrupted, NotFound, StorageError, ValidationFailed
from app.utils.dates import now_iso

log = logging.getLogger("abharanam.storage")

SCHEMA_VERSION = 1
JOURNAL_NAME = ".txn_journal.json"


@dataclass
class CollectionSpec:
    """Describes one JSON file."""
    name: str                      # file is <name>.json
    kind: str = "list"             # "list" = many records, "doc" = one settings-style object
    model: Any = None              # optional pydantic model used to validate changed records
    id_field: str = "id"
    critical: bool = True
    default_doc: dict = field(default_factory=dict)

    @property
    def filename(self) -> str:
        return f"{self.name}.json"


@dataclass
class CollectionStatus:
    name: str
    state: str = "ok"              # ok | created | corrupted
    message: str = ""
    records: int = 0
    revision: int = 0
    updated_at: str = ""


def _replace_with_retry(src: Path, dst: Path, attempts: int = 8) -> None:
    """os.replace with a few retries (Windows antivirus / indexers can briefly lock files)."""
    for i in range(attempts):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if i == attempts - 1:
                raise
            time.sleep(0.05 * (i + 1))


COMPACT_ABOVE = 3000     # files with more records than this are written compactly (no indentation)


def _fsync_write(path: Path, data: str | bytes) -> bytes:
    """Write + flush to disk.  Returns exactly the bytes written (the caller verifies the file against them)."""
    raw = data.encode("utf-8") if isinstance(data, str) else data
    with open(path, "wb") as fh:
        fh.write(raw)
        fh.flush()
        os.fsync(fh.fileno())
    return raw


def _dump(envelope: dict, count: int) -> bytes:
    """Human friendly (indented) for normal sizes, compact for very large files."""
    if orjson is not None:
        opt = orjson.OPT_INDENT_2 if count <= COMPACT_ABOVE else 0
        return orjson.dumps(envelope, option=opt | orjson.OPT_NON_STR_KEYS)
    if count <= COMPACT_ABOVE:
        return json.dumps(envelope, ensure_ascii=False, indent=2).encode("utf-8")
    return json.dumps(envelope, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _loads(raw: bytes):
    if raw.startswith(b"\xef\xbb\xbf"):               # a byte-order mark added by some editors
        raw = raw[3:]
    return orjson.loads(raw) if orjson is not None else json.loads(raw.decode("utf-8"))


class JsonStore:
    def __init__(self, data_dir: Path, specs: list[CollectionSpec]):
        self.data_dir = Path(data_dir)
        self.specs: dict[str, CollectionSpec] = {s.name: s for s in specs}
        self._lock = threading.RLock()
        self._filelock: FileLock | None = None
        self._data: dict[str, Any] = {}
        self._index: dict[str, dict[str, dict]] = {}
        self._meta: dict[str, CollectionStatus] = {}
        self._derived: dict[tuple, tuple[int, Any]] = {}
        self.recovered_from_crash: str = ""
        self._fault_hook: Callable[[str, str], None] | None = None   # used by tests only
        self.is_open = False
        self.remote: Any = None        # app.storage.cloud.CloudRecords in online mode (the master copy)

    # ------------------------------------------------------------------ lifecycle
    def open(self) -> "JsonStore":
        with self._lock:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            self._filelock = FileLock(str(self.data_dir / ".app.lock"), timeout=0, thread_local=False)
            try:
                self._filelock.acquire()
            except Timeout:
                raise StorageError(
                    "Another copy of ABHARANAM COLLECTIONS is already using this data folder. "
                    "Close the other window first.")
            self._recover_interrupted_commit()
            self.load_all()
            self.is_open = True
        return self

    # ------------------------------------------------------------------ online mode
    def seed_from_remote(self) -> int:
        """Online mode: write the local data files from the copy saved online.  Returns the records loaded."""
        if self.remote is None:
            return 0
        with self._lock:
            online = self.remote.pull()
            self.data_dir.mkdir(parents=True, exist_ok=True)
            total = 0
            for name, spec in self.specs.items():
                path = self.path(name)
                saved = online.get(name)
                if saved is None:
                    path.unlink(missing_ok=True)          # never saved online yet: starts empty
                    continue
                if spec.kind == "doc":
                    payload = saved.get("doc") if isinstance(saved.get("doc"), dict) else copy.deepcopy(spec.default_doc)
                    count = 0
                else:
                    payload = saved.get("records") or []
                    count = len(payload)
                total += count
                _fsync_write(path, _dump(self._envelope(spec, payload, saved["revision"]), count))
            return total

    def _remote_ops(self, tx: "Transaction", touched: list[str], new_revision: dict[str, int]) -> list[dict]:
        ops = []
        for name in touched:
            spec = self.specs[name]
            op: dict[str, Any] = {"c": name, "rev": new_revision[name], "id_field": spec.id_field}
            if spec.kind == "doc":
                op["doc"] = tx._docs[name]
            else:
                changes = tx._changes.get(name, {})
                inserted = [rid for rid in dict.fromkeys(tx._inserted.get(name, [])) if changes.get(rid) is not None]
                new_ids = set(inserted)
                op["up"] = [rec for rid, rec in changes.items() if rec is not None and rid not in new_ids] + \
                           [changes[rid] for rid in inserted]
                op["del"] = [rid for rid, rec in changes.items() if rec is None and rid in self._index[name]]
            ops.append(op)
        return ops

    def _reload_from_remote(self) -> None:
        try:
            self.seed_from_remote()
            self.load_all()
        except Exception:  # pragma: no cover - the original error is what the user needs to see
            log.exception("Reloading from the online copy failed")

    def close(self) -> None:
        with self._lock:
            if self._filelock is not None:
                try:
                    self._filelock.release()
                except Exception:  # pragma: no cover
                    pass
                self._filelock = None
            self.is_open = False

    # ------------------------------------------------------------------ loading
    def path(self, name: str) -> Path:
        return self.data_dir / self.specs[name].filename

    def load_all(self) -> None:
        with self._lock:
            self._data.clear()
            self._index.clear()
            self._meta.clear()
            self._derived.clear()
            for name in self.specs:
                self._load_one(name)
            # A brand-new installation has no files at all - that is normal, not a warning.
            if self._meta and all(m.state == "created" for m in self._meta.values()):
                for m in self._meta.values():
                    m.state, m.message = "ok", ""

    def _empty(self, spec: CollectionSpec):
        return {} if spec.kind == "doc" else []

    def _envelope(self, spec: CollectionSpec, payload, revision: int) -> dict:
        env = {"schema_version": SCHEMA_VERSION, "revision": revision, "updated_at": now_iso()}
        env["data" if spec.kind == "doc" else "records"] = payload
        return env

    def _load_one(self, name: str) -> None:
        spec = self.specs[name]
        path = self.path(name)
        meta = CollectionStatus(name=name)
        self._meta[name] = meta
        if not path.exists():
            payload = copy.deepcopy(spec.default_doc) if spec.kind == "doc" else []
            try:
                _fsync_write(path, _dump(self._envelope(spec, payload, 0), 0))
                meta.state = "created"
                meta.message = f"{spec.filename} was missing - a new empty file was created."
                log.warning(meta.message)
            except OSError as exc:
                meta.state, meta.message = "corrupted", f"cannot create {spec.filename}: {exc}"
                self._data[name] = None
                return
            self._data[name] = payload
            self._index[name] = {}
            meta.updated_at = now_iso()
            return
        try:
            raw = _loads(path.read_bytes())
            if isinstance(raw, list):                       # tolerate a hand-made bare list
                raw = {"schema_version": SCHEMA_VERSION, "revision": 0, "records": raw}
            if not isinstance(raw, dict):
                raise ValueError("top level must be an object")
            if spec.kind == "doc":
                payload = raw.get("data")
                if not isinstance(payload, dict):
                    raise ValueError("'data' must be an object")
                merged = copy.deepcopy(spec.default_doc)
                merged.update(payload)
                payload = merged
            else:
                payload = raw.get("records")
                if not isinstance(payload, list):
                    raise ValueError("'records' must be a list")
                if any(not isinstance(r, dict) or spec.id_field not in r for r in payload):
                    raise ValueError(f"every record needs an '{spec.id_field}'")
            meta.revision = int(raw.get("revision", 0) or 0)
            meta.updated_at = str(raw.get("updated_at", ""))
        except (ValueError, OSError, UnicodeDecodeError, TypeError) as exc:
            meta.state = "corrupted"
            meta.message = f"{spec.filename} appears to be corrupted ({exc}). Please restore a backup."
            log.error(meta.message)
            self._data[name] = None
            return
        self._data[name] = payload
        if spec.kind == "list":
            self._index[name] = {r[spec.id_field]: r for r in payload}
            meta.records = len(payload)
        else:
            meta.records = 1

    # ------------------------------------------------------------------ reading
    def _check(self, name: str) -> None:
        if name not in self.specs:
            raise StorageError(f"Unknown data collection '{name}'.")
        if self._data.get(name) is None:
            raise DataCorrupted(self.specs[name].filename, self._meta[name].message)

    def all(self, name: str) -> list[dict]:
        """Committed records (a snapshot).  Do NOT modify the returned dicts."""
        self._check(name)
        return self._data[name]

    def get(self, name: str, rid: str) -> dict | None:
        self._check(name)
        return self._index[name].get(rid)

    def require(self, name: str, rid: str, label: str | None = None) -> dict:
        rec = self.get(name, rid)
        if rec is None:
            raise NotFound(f"{label or name.rstrip('s').replace('_', ' ').title()} '{rid}' was not found.")
        return rec

    def count(self, name: str) -> int:
        return len(self.all(name))

    def doc(self, name: str) -> dict:
        self._check(name)
        return self._data[name]

    def derived(self, name: str, key: str, builder: Callable[[list[dict]], Any]) -> Any:
        """Cached value computed from a collection; rebuilt automatically after any change to it."""
        self._check(name)
        data = self._data[name]
        hit = self._derived.get((name, key))
        if hit and hit[0] == id(data):
            return hit[1]
        value = builder(data)
        self._derived[(name, key)] = (id(data), value)
        return value

    def status(self) -> dict[str, CollectionStatus]:
        return dict(self._meta)

    def corrupted(self) -> list[CollectionStatus]:
        return [m for m in self._meta.values() if m.state == "corrupted"]

    def raw_file_ok(self, name: str) -> tuple[bool, str]:
        """Re-check the file on disk (used by the Data Health screen)."""
        p = self.path(name)
        if not p.exists():
            return False, "file is missing"
        try:
            _loads(p.read_bytes())
            return True, ""
        except Exception as exc:
            return False, str(exc)

    # ------------------------------------------------------------------ writing
    @contextmanager
    def transaction(self) -> Iterator["Transaction"]:
        """Everything changed inside the ``with`` block is saved together, or not at all."""
        with self._lock:
            tx = Transaction(self)
            yield tx                      # an exception here simply discards the transaction
            self._commit(tx)

    def _commit(self, tx: "Transaction") -> None:
        touched = tx.touched_names()
        if not touched:
            return
        for name in touched:
            self._check(name)

        # 1. validate every changed record
        for name, changes in tx._changes.items():
            spec = self.specs[name]
            if spec.model is None:
                continue
            for rid, rec in changes.items():
                if rec is None:
                    continue
                try:
                    spec.model.model_validate(rec)
                except Exception as exc:
                    raise ValidationFailed(f"Invalid {name} record '{rid}': {_short_error(exc)}")

        # 2. prepare the new in-memory versions
        new_payload: dict[str, Any] = {}
        new_index: dict[str, dict] = {}
        pure_appends: dict[str, list[dict]] = {}
        for name in touched:
            spec = self.specs[name]
            if spec.kind == "doc":
                new_payload[name] = tx._docs[name]
                continue
            changes = tx._changes.get(name, {})
            base = self._data[name]
            inserted = [rid for rid in tx._inserted.get(name, []) if changes.get(rid) is not None]
            if len(inserted) == len(changes):                  # only NEW records were added (very common)
                added = [changes[rid] for rid in inserted]
                merged = base + added
                new_index[name] = {**self._index[name], **{r[spec.id_field]: r for r in added}}
                pure_appends[name] = added
            else:
                merged = []
                for rec in base:
                    rid = rec[spec.id_field]
                    if rid in changes:
                        if changes[rid] is not None:
                            merged.append(changes[rid])
                    else:
                        merged.append(rec)
                for rid in inserted:
                    merged.append(changes[rid])
                new_index[name] = {r[spec.id_field]: r for r in merged}
            new_payload[name] = merged

        # 3. write temp files, flush to disk, re-read to verify
        tmp_files: dict[str, Path] = {}
        new_revision: dict[str, int] = {}
        try:
            for name in touched:
                spec = self.specs[name]
                revision = self._meta[name].revision + 1
                new_revision[name] = revision
                payload = new_payload[name]
                env = self._envelope(spec, payload, revision)
                data = None
                if name in pure_appends:
                    data = self._extend_file(spec, revision, len(self._data[name]), pure_appends[name])
                if data is None:
                    data = _dump(env, len(payload) if spec.kind == "list" else 0)
                tmp = self.data_dir / f"{spec.filename}.{os.getpid()}.tmp"
                written = _fsync_write(tmp, data)
                # verify: read the file back from disk and compare it byte-for-byte with what we meant to write
                if tmp.read_bytes() != written:
                    raise StorageError(f"Verification of {spec.filename} failed after writing.")
                tmp_files[name] = tmp
        except Exception:
            for tmp in tmp_files.values():
                tmp.unlink(missing_ok=True)
            for tmp in self.data_dir.glob(f"*.{os.getpid()}.tmp"):
                tmp.unlink(missing_ok=True)
            raise

        # 3b. online mode: save online first (all or nothing).  If that fails, nothing changes here either.
        if self.remote is not None:
            try:
                self.remote.commit(self._remote_ops(tx, touched, new_revision))
            except Exception as exc:
                for tmp in tmp_files.values():
                    tmp.unlink(missing_ok=True)
                if exc.__class__.__name__ == "StaleData":
                    self._reload_from_remote()
                if isinstance(exc, StorageError):
                    raise
                raise StorageError("Could not save online. Nothing was changed; please try again.") from exc

        # 4. journal + keep previous versions, then swap all files in
        journal = self.data_dir / JOURNAL_NAME
        entries = [{"file": self.specs[n].filename, "existed": self.path(n).exists()} for n in touched]
        pre_files: dict[str, Path] = {}
        replaced: list[str] = []
        try:
            _fsync_write(journal, json.dumps({"state": "replacing", "files": entries, "at": now_iso()}))
            for name in touched:
                target = self.path(name)
                pre = target.with_name(target.name + ".pre-txn")
                pre.unlink(missing_ok=True)
                if target.exists():
                    try:
                        os.link(target, pre)            # instant snapshot (hard link)
                    except OSError:
                        shutil.copy2(target, pre)
                    pre_files[name] = pre
            for name in touched:
                if self._fault_hook:
                    self._fault_hook("before_replace", name)
                _replace_with_retry(tmp_files[name], self.path(name))
                replaced.append(name)
        except Exception as exc:
            log.exception("Commit failed - rolling back")
            self._rollback_files(replaced, pre_files, touched)
            for tmp in tmp_files.values():
                tmp.unlink(missing_ok=True)
            journal.unlink(missing_ok=True)
            for pre in pre_files.values():
                pre.unlink(missing_ok=True)
            if isinstance(exc, (StorageError, ValidationFailed)):
                raise
            raise StorageError("Could not save your data safely. Nothing was changed. "
                               "Please try again; if it keeps happening see Data Health.") from exc

        # 5. success - publish to memory, clean up
        for name in touched:
            self._data[name] = new_payload[name]
            meta = self._meta[name]
            meta.revision = new_revision[name]
            meta.updated_at = now_iso()
            if self.specs[name].kind == "list":
                self._index[name] = new_index[name]
                meta.records = len(new_payload[name])
            meta.state = "ok" if meta.state != "corrupted" else meta.state
        journal.unlink(missing_ok=True)
        for pre in pre_files.values():
            pre.unlink(missing_ok=True)

    def _extend_file(self, spec: CollectionSpec, revision: int, old_count: int, new_records: list[dict]) -> bytes | None:
        """Big files that only gained new records: reuse the bytes already on disk and add the new records.

        Saves re-serialising tens of megabytes of history on every bill.  Returns None when the shortcut does not
        apply (small / indented file, unexpected layout) - the caller then writes the whole file normally.
        """
        if orjson is None or old_count <= COMPACT_ABOVE or not new_records:
            return None
        try:
            old = self.path(spec.name).read_bytes()
        except OSError:
            return None
        marker = b'"records":['
        i = old.find(marker)
        body_start = i + len(marker)
        if i < 0 or i > 200 or not old.endswith(b"]}") or old[body_start:body_start + 1] != b"{" or old[-3:-2] != b"}":
            return None
        head = orjson.dumps({"schema_version": SCHEMA_VERSION, "revision": revision, "updated_at": now_iso()})[:-1]
        added = b",".join(orjson.dumps(r, option=orjson.OPT_NON_STR_KEYS) for r in new_records)
        return head + b',"records":[' + old[body_start:-2] + b"," + added + b"]}"

    def _rollback_files(self, replaced: list[str], pre_files: dict[str, Path], touched: list[str]) -> None:
        for name in replaced:
            target = self.path(name)
            pre = pre_files.get(name)
            try:
                if pre is not None and pre.exists():
                    _replace_with_retry(pre, target)
                elif pre is None:
                    target.unlink(missing_ok=True)      # file did not exist before
            except Exception:  # pragma: no cover
                log.exception("Rollback of %s failed", target)

    def _recover_interrupted_commit(self) -> None:
        """If the app / computer stopped in the middle of a multi-file save, undo it."""
        journal = self.data_dir / JOURNAL_NAME
        leftovers = list(self.data_dir.glob("*.tmp")) + list(self.data_dir.glob("*.pre-txn"))
        if not journal.exists():
            for tmp in self.data_dir.glob("*.tmp"):
                tmp.unlink(missing_ok=True)
            for pre in self.data_dir.glob("*.pre-txn"):
                pre.unlink(missing_ok=True)
            return
        try:
            info = json.loads(journal.read_text(encoding="utf-8"))
        except Exception:
            info = {"state": "replacing", "files": []}
        restored = []
        for entry in info.get("files", []):
            target = self.data_dir / entry["file"]
            pre = target.with_name(target.name + ".pre-txn")
            if pre.exists():
                _replace_with_retry(pre, target)
                restored.append(entry["file"])
            elif not entry.get("existed", True):
                target.unlink(missing_ok=True)
        for f in leftovers:
            f.unlink(missing_ok=True)
        journal.unlink(missing_ok=True)
        self.recovered_from_crash = (
            "The app stopped in the middle of saving last time. The unfinished save was undone "
            f"and your data was returned to the last complete state ({', '.join(restored) or 'no files changed'}).")
        log.warning(self.recovered_from_crash)

    # ------------------------------------------------------------------ restore support
    def replace_all_from(self, source_dir: Path) -> None:
        """Used by restore: atomically replace every data file with the copy from ``source_dir``.

        The caller must already have validated the source files and made a backup.
        """
        with self._lock:
            if self.remote is not None:
                cols = []
                for name, spec in self.specs.items():
                    src = Path(source_dir) / spec.filename
                    if not src.exists():
                        continue
                    raw = _loads(src.read_bytes())
                    if isinstance(raw, list):
                        raw = {"records": raw}
                    rev = self._meta[name].revision + 1 if name in self._meta else 1
                    col: dict[str, Any] = {"c": name, "rev": rev, "id_field": spec.id_field}
                    if spec.kind == "doc":
                        col["doc"] = raw.get("data") or {}
                    else:
                        col["records"] = raw.get("records") or []
                    cols.append(col)
                self.remote.replace(cols)
            pushed = {c["c"]: c["rev"] for c in cols} if self.remote is not None else {}
            staged: list[tuple[Path, Path]] = []
            try:
                for name, spec in self.specs.items():
                    src = Path(source_dir) / spec.filename
                    if not src.exists():
                        continue
                    tmp = self.data_dir / f"{spec.filename}.{os.getpid()}.tmp"
                    shutil.copy2(src, tmp)
                    staged.append((tmp, self.path(name)))
                for tmp, target in staged:
                    _replace_with_retry(tmp, target)
            finally:
                for tmp, _ in staged:
                    tmp.unlink(missing_ok=True)
            self.load_all()
            for name, rev in pushed.items():          # keep the local revisions in step with the online copy
                if name in self._meta:
                    self._meta[name].revision = rev


def _short_error(exc: Exception) -> str:
    try:
        errs = exc.errors()  # type: ignore[attr-defined]
        return "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in errs[:3])
    except Exception:
        return str(exc)


class Transaction:
    """A unit of work.  Changes are staged here and only saved when the ``with`` block ends cleanly."""

    def __init__(self, store: JsonStore):
        self.store = store
        self._changes: dict[str, dict[str, dict | None]] = {}
        self._inserted: dict[str, list[str]] = {}
        self._docs: dict[str, dict] = {}

    # ---- bookkeeping
    def touched_names(self) -> list[str]:
        names = [n for n, c in self._changes.items() if c]
        names += [n for n in self._docs if n not in names]
        return sorted(names)

    def _spec(self, name: str) -> CollectionSpec:
        self.store._check(name)
        return self.store.specs[name]

    # ---- reads (see staged changes)
    def get(self, name: str, rid: str) -> dict | None:
        """Return a private COPY that is safe to modify (call ``put`` to save it)."""
        self._spec(name)
        ch = self._changes.get(name, {})
        if rid in ch:
            rec = ch[rid]
            return copy.deepcopy(rec) if rec is not None else None
        rec = self.store._index[name].get(rid)
        return copy.deepcopy(rec) if rec is not None else None

    def require(self, name: str, rid: str, label: str | None = None) -> dict:
        rec = self.get(name, rid)
        if rec is None:
            raise NotFound(f"{label or name.rstrip('s').replace('_', ' ').title()} '{rid}' was not found.")
        return rec

    def exists(self, name: str, rid: str) -> bool:
        return self.get(name, rid) is not None

    def iter_all(self, name: str) -> Iterator[dict]:
        """Read-only iteration over committed records with staged changes applied."""
        spec = self._spec(name)
        ch = self._changes.get(name, {})
        for rec in self.store._data[name]:
            rid = rec[spec.id_field]
            if rid in ch:
                if ch[rid] is not None:
                    yield ch[rid]
            else:
                yield rec
        for rid in self._inserted.get(name, []):
            if ch.get(rid) is not None and rid not in self.store._index[name]:
                yield ch[rid]

    # ---- writes
    def insert(self, name: str, rec: dict) -> dict:
        spec = self._spec(name)
        rid = rec.get(spec.id_field)
        if not rid:
            raise StorageError(f"Cannot save a {name} record without an id.")
        if self.exists(name, rid):
            raise StorageError(f"{name} record '{rid}' already exists.")
        self._changes.setdefault(name, {})[rid] = rec
        if rid not in self.store._index[name]:
            self._inserted.setdefault(name, []).append(rid)
        return rec

    def put(self, name: str, rec: dict) -> dict:
        spec = self._spec(name)
        rid = rec[spec.id_field]
        if not self.exists(name, rid):
            raise NotFound(f"{name} record '{rid}' does not exist.")
        self._changes.setdefault(name, {})[rid] = rec
        return rec

    def update(self, collection: str, rid: str, /, **fields) -> dict:
        rec = self.require(collection, rid)
        rec.update(fields)
        return self.put(collection, rec)

    def delete(self, name: str, rid: str) -> None:
        self._spec(name)
        if not self.exists(name, rid):
            raise NotFound(f"{name} record '{rid}' does not exist.")
        self._changes.setdefault(name, {})[rid] = None

    def doc(self, name: str) -> dict:
        """Working copy of a single-object file (settings, counters).  Modify it in place."""
        spec = self._spec(name)
        if spec.kind != "doc":
            raise StorageError(f"{name} is not a document collection.")
        if name not in self._docs:
            self._docs[name] = copy.deepcopy(self.store._data[name])
        return self._docs[name]

    def next_id(self, prefix: str, width: int = 6, start: int = 1) -> str:
        counters = self.doc("counters")
        n = int(counters.get(prefix, start - 1)) + 1
        counters[prefix] = n
        return f"{prefix}-{n:0{width}d}"

    def next_number(self, key: str, start: int = 1) -> int:
        counters = self.doc("counters")
        n = max(int(counters.get(key, start - 1)) + 1, start)     # never below the minimum (e.g. 6-digit barcodes)
        counters[key] = n
        return n
