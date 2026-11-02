"""Online mode: keep the shop software's data in Supabase, so it can run on Cloudflare.

On the shop computer nothing here is used: data stays in the ``data`` folder as before.

When SHOP_CLOUD=1 (set inside the online container):

* ``CloudRecords`` is the master copy of the data files.  At start-up every file is read from Supabase and
  written to the local ``data`` folder; then the normal JsonStore opens it.  Every save (one transaction) is
  sent to Supabase *before* it is applied locally, in one database call, so it is saved online completely or
  not at all.  If saving online fails, nothing changes and the user sees a clear message.
* ``FileMirror`` keeps the folders with pictures (product photos, expense receipts, the logo) and backups in
  the private Supabase storage bucket ``shop-files``.  They are downloaded at start-up and new or changed files
  are uploaded within a few seconds (and once more when the container stops).

Settings (Cloudflare secrets, passed to the container):
    SHOP_CLOUD=1
    WEBSITE_SUPABASE_URL=https://<project ref>.supabase.co
    WEBSITE_SUPABASE_SERVICE_KEY=<service_role / secret key>
"""
from __future__ import annotations

import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

import httpx

from app.core.errors import StorageError

log = logging.getLogger("abharanam.cloud")

BUCKET = "shop-files"
PAGE = 1000
# Folders (relative to the base folder) kept in the bucket.  Imports, exports, invoices and labels are
# temporary files that are made again when needed.
MIRRORED = ("uploads/products", "uploads/expenses", "assets/logo", "backups")


class StaleData(StorageError):
    """Another copy of the software saved newer data (only possible for a moment during an update)."""
    status_code = 409


def enabled() -> bool:
    return os.environ.get("SHOP_CLOUD", "").strip() == "1"


def _client_from_env() -> httpx.Client:
    url = os.environ.get("WEBSITE_SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("WEBSITE_SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key:
        raise StorageError("Online mode needs WEBSITE_SUPABASE_URL and WEBSITE_SUPABASE_SERVICE_KEY.")
    headers = {"apikey": key}
    if key.startswith("eyJ"):                          # legacy JWT keys also go in Authorization
        headers["Authorization"] = f"Bearer {key}"
    return httpx.Client(base_url=url, headers=headers, timeout=httpx.Timeout(60.0, connect=10.0))


def _error(r: httpx.Response) -> str:
    try:
        body = r.json()
        return str(body.get("message") or body.get("error") or body)
    except ValueError:
        return r.text[:300]


# ----------------------------------------------------------------------------------------- data
class CloudRecords:
    def __init__(self, client: httpx.Client):
        self.client = client

    def _rpc(self, fn: str, body: dict) -> Any:
        try:
            r = self.client.post(f"/rest/v1/rpc/{fn}", json=body)
        except httpx.HTTPError as exc:
            raise StorageError("Could not reach the online database. Check the internet connection and try again. "
                               "Nothing was changed.") from exc
        if r.status_code >= 400:
            msg = _error(r)
            if "changed elsewhere" in msg:
                raise StaleData("The data was changed by another copy of the shop software (it was probably just "
                                "updated). Refresh the page and try again.")
            raise StorageError(f"The online database refused the save: {msg}. Nothing was changed.")
        return r.json() if r.content else None

    # -- writing
    def commit(self, ops: list[dict]) -> None:
        if ops:
            self._rpc("shop_store_commit", {"p_ops": ops})

    def replace(self, cols: list[dict]) -> None:
        if cols:
            self._rpc("shop_store_replace", {"p_cols": cols})

    # -- reading
    def collections(self) -> list[dict]:
        return self._rpc("shop_store_collections", {}) or []

    def records(self, name: str) -> list[dict]:
        out: list[dict] = []
        after = 0
        while True:
            rows = self._rpc("shop_store_records", {"p_collection": name, "p_after": after, "p_limit": PAGE}) or []
            out.extend(r["data"] for r in rows)
            if len(rows) < PAGE:
                return out
            after = rows[-1]["seq"]

    def pull(self) -> dict[str, dict]:
        """{collection name: {"revision": n, "doc": {...} | None, "records": [...]}} for everything saved online."""
        out = {}
        for c in self.collections():
            out[c["name"]] = {"revision": int(c["revision"]), "doc": c.get("doc"),
                              "records": self.records(c["name"]) if int(c.get("records") or 0) else []}
        return out


# ----------------------------------------------------------------------------------------- files
class FileMirror:
    """Keeps a few local folders in step with the private storage bucket."""

    def __init__(self, client: httpx.Client, base_dir: Path, folders: tuple[str, ...] = MIRRORED,
                 interval: float = 3.0):
        self.client = client
        self.base = Path(base_dir)
        self.folders = folders
        self.interval = interval
        self._known: dict[str, tuple[float, int]] = {}
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self.last_error = ""

    # -- bucket helpers
    def _list(self, prefix: str) -> list[str]:
        """Every file below prefix (recursively)."""
        files: list[str] = []
        offset = 0
        while True:
            r = self.client.post(f"/storage/v1/object/list/{BUCKET}",
                                 json={"prefix": prefix, "limit": 1000, "offset": offset})
            if r.status_code >= 400:
                raise StorageError(f"Could not list online files: {_error(r)}")
            items = r.json()
            for it in items:
                path = f"{prefix}/{it['name']}" if prefix else it["name"]
                if it.get("id") is None:                       # a folder
                    files.extend(self._list(path))
                else:
                    files.append(path)
            if len(items) < 1000:
                return files
            offset += 1000

    def _url(self, rel: str) -> str:
        return f"/storage/v1/object/{BUCKET}/{quote(rel)}"

    def _upload(self, rel: str) -> None:
        data = (self.base / rel).read_bytes()
        r = self.client.post(self._url(rel), content=data,
                             headers={"x-upsert": "true", "content-type": "application/octet-stream"})
        if r.status_code >= 400:
            raise StorageError(f"Could not upload {rel}: {_error(r)}")

    def _delete(self, rels: list[str]) -> None:
        if rels:
            r = self.client.request("DELETE", f"/storage/v1/object/{BUCKET}", json={"prefixes": rels})
            if r.status_code >= 400:
                raise StorageError(f"Could not delete online files: {_error(r)}")

    def _scan(self) -> dict[str, tuple[float, int]]:
        found: dict[str, tuple[float, int]] = {}
        for folder in self.folders:
            root = self.base / folder
            if not root.exists():
                continue
            for p in root.rglob("*"):
                if p.is_file() and not p.name.endswith((".tmp", ".part")):
                    st = p.stat()
                    found[p.relative_to(self.base).as_posix()] = (st.st_mtime, st.st_size)
        return found

    # -- public
    def pull(self) -> int:
        """Download every mirrored file (start-up)."""
        rels = [r for folder in self.folders for r in self._list(folder)]

        def get(rel: str) -> None:
            r = self.client.get(self._url(rel))
            if r.status_code >= 400:
                raise StorageError(f"Could not download {rel}: {_error(r)}")
            target = self.base / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(r.content)

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(get, rels))
        self._known = self._scan()
        return len(rels)

    def sync(self) -> int:
        """Upload new / changed files and remove deleted ones.  Returns the number of changes."""
        with self._lock:
            now = self._scan()
            changed = [rel for rel, sig in now.items() if self._known.get(rel) != sig]
            gone = [rel for rel in self._known if rel not in now]
            try:
                for rel in changed:
                    self._upload(rel)
                    self._known[rel] = now[rel]
                self._delete(gone)
                for rel in gone:
                    self._known.pop(rel, None)
                self.last_error = ""
            except (OSError, httpx.HTTPError, StorageError) as exc:
                self.last_error = str(exc)
                log.warning("Saving files online failed (will retry): %s", exc)
            return len(changed) + len(gone)

    def start(self) -> None:
        def loop() -> None:
            while not self._stop.wait(self.interval):
                self.sync()
        self._thread = threading.Thread(target=loop, name="file-mirror", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=10)
        self.sync()                                       # last changes before the container stops


# ----------------------------------------------------------------------------------------- setup
def connect(base_dir: Path, client_factory: Callable[[], httpx.Client] | None = None) -> tuple[CloudRecords, FileMirror]:
    client = (client_factory or _client_from_env)()
    return CloudRecords(client), FileMirror(client, base_dir)
