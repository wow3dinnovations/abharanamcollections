"""Publish the catalog to the customer website and app (1gram.abharanamcollections.com).

The shop software stays the master copy. This service sends a SAFE subset of it to the website's
Supabase database:

    categories, sub-categories, product name / SKU / selling price / description / collection /
    material / colour / size / tags, total stock (all locations added up), active or not, and the
    product photo.

It NEVER sends purchase rates, vendors, locations, sales, customers, expenses or staff.

Only products that changed since the last publish are sent (a fingerprint of each one is kept in
data/website_sync.json). Runs automatically every few minutes when switched on, and from the
Administration -> Website page.

Settings live in backend/.env (never in git):
    WEBSITE_SUPABASE_URL=https://xxxx.supabase.co
    WEBSITE_SUPABASE_SERVICE_KEY=the service_role / secret key
    WEBSITE_SYNC_MINUTES=5            (0 = only when you press "Publish now")
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

import httpx

from app.core.context import AppContext
from app.core.errors import ValidationFailed
from app.utils.dates import now_iso

log = logging.getLogger("abharanam.website")

STATE = "website_sync"
BATCH = 200
_run_lock = threading.Lock()


@dataclass
class SyncConfig:
    url: str
    key: str
    minutes: float

    @property
    def configured(self) -> bool:
        return bool(self.url and self.key)


def load_config() -> SyncConfig:
    url = os.environ.get("WEBSITE_SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("WEBSITE_SUPABASE_SERVICE_KEY", "").strip()
    try:
        minutes = float(os.environ.get("WEBSITE_SYNC_MINUTES", "5"))
    except ValueError:
        minutes = 5
    return SyncConfig(url=url, key=key, minutes=max(0.0, minutes))


ClientFactory = Callable[[SyncConfig], httpx.Client]


def _default_client(cfg: SyncConfig) -> httpx.Client:
    return httpx.Client(
        base_url=cfg.url,
        timeout=httpx.Timeout(30.0, connect=10.0),
        headers={"apikey": cfg.key, "Authorization": f"Bearer {cfg.key}"},
    )


# ---------------------------------------------------------------------------- payloads
def _ist(ts: str | None) -> str | None:
    """Shop timestamps are local India time without a zone; tell the database so."""
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts)
    except ValueError:
        return None
    return dt.isoformat() if dt.tzinfo else dt.isoformat() + "+05:30"


def _text(v, limit: int = 2000) -> str:
    return str(v or "").strip()[:limit]


def category_payload(c: dict) -> dict:
    return {
        "local_id": c["id"],
        "name": _text(c.get("name"), 100) or c["id"],
        "code": _text(c.get("code"), 10) or None,
        "is_active": bool(c.get("active", True)),
    }


def subcategory_payload(s: dict, category_uuid: str) -> dict:
    return {
        "local_id": s["id"],
        "name": _text(s.get("name"), 100) or s["id"],
        "category_id": category_uuid,
        "is_active": bool(s.get("active", True)),
    }


def product_payload(p: dict, cat_ids: dict[str, str], sub_ids: dict[str, str], image_path: str | None) -> dict:
    stock = sum(max(0, int(q)) for q in (p.get("stock") or {}).values())
    tags = [t for t in (_text(x, 40) for x in (p.get("tags") or [])) if t][:20]
    return {
        "local_id": p["id"],
        "sku": p["sku"],
        "name": _text(p.get("name"), 150) or p["sku"],
        "category_id": cat_ids.get(p.get("category_id") or ""),
        "subcategory_id": sub_ids.get(p.get("subcategory_id") or ""),
        "description": _text(p.get("description")),
        "price": round(float(p.get("selling_price") or 0), 2),
        "collection": _text(p.get("collection"), 80),
        "material": _text(p.get("material"), 80),
        "colour": _text(p.get("colour"), 80),
        "size": _text(p.get("size"), 80),
        "design_number": _text(p.get("design_number"), 80),
        "tags": tags,
        "stock_qty": stock,
        "image_paths": [image_path] if image_path else [],
        "is_active": p.get("status", "active") == "active",
        "added_at": _ist(p.get("date_added")) or _ist(p.get("created_at")),
    }


def _fingerprint(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:24]


def _safe_name(sku: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", sku)[:60] or "item"


# ---------------------------------------------------------------------------- HTTP helpers
class SyncError(Exception):
    pass


def _check(resp: httpx.Response, what: str) -> httpx.Response:
    if resp.status_code >= 400:
        try:
            body = resp.json()
            msg = body.get("message") or body.get("error") or body.get("msg") or resp.text
        except ValueError:
            msg = resp.text
        if resp.status_code in (401, 403):
            msg = "the website key was refused. Check WEBSITE_SUPABASE_SERVICE_KEY in backend/.env"
        raise SyncError(f"Could not {what}: {str(msg)[:300]}")
    return resp


def _upsert(client: httpx.Client, table: str, rows: list[dict], what: str) -> list[dict]:
    out: list[dict] = []
    for i in range(0, len(rows), BATCH):
        resp = client.post(
            f"/rest/v1/{table}",
            params={"on_conflict": "local_id", "select": "id,local_id"},
            headers={"Prefer": "resolution=merge-duplicates,return=representation", "Content-Type": "application/json"},
            content=json.dumps(rows[i:i + BATCH]),
        )
        out.extend(_check(resp, what).json())
    return out


def _upload_photo(client: httpx.Client, path: str, content: bytes) -> None:
    resp = client.post(
        f"/storage/v1/object/catalog/{path}",
        headers={"Content-Type": "image/jpeg", "x-upsert": "true", "cache-control": "max-age=31536000"},
        content=content,
    )
    _check(resp, "upload a product photo")


def _delete_photos(client: httpx.Client, paths: list[str]) -> None:
    if not paths:
        return
    try:
        client.request("DELETE", "/storage/v1/object/catalog", json={"prefixes": paths})
    except httpx.HTTPError:
        pass  # an old photo left behind is harmless


# ---------------------------------------------------------------------------- the publish
def status(ctx: AppContext) -> dict:
    cfg = load_config()
    st = ctx.store.doc(STATE) or {}
    products = [p for p in ctx.store.all("products") if p.get("status") != "deleted"]
    synced = st.get("products") or {}
    pending = sum(1 for p in products if p["id"] not in synced)
    return {
        "configured": cfg.configured,
        "website_url": os.environ.get("WEBSITE_PUBLIC_URL", "https://1gram.abharanamcollections.com"),
        "supabase_host": re.sub(r"^https?://", "", cfg.url) if cfg.url else "",
        "auto_minutes": cfg.minutes,
        "last_success": st.get("last_success"),
        "last_error": st.get("last_error"),
        "last_error_at": st.get("last_error_at"),
        "last_result": st.get("last_result"),
        "published_products": len(synced),
        "never_published": pending,
        "products_without_photo": sum(1 for p in products if p.get("status") == "active" and not p.get("image")),
    }


def run_sync(ctx: AppContext, *, force: bool = False, client_factory: ClientFactory | None = None,
             trigger: str = "manual") -> dict:
    cfg = load_config()
    if not cfg.configured:
        raise ValidationFailed("The website is not connected yet. Add WEBSITE_SUPABASE_URL and "
                               "WEBSITE_SUPABASE_SERVICE_KEY to backend/.env and restart the application.")
    if not _run_lock.acquire(blocking=False):
        raise ValidationFailed("A publish is already running. Please wait a moment.")
    started = now_iso()
    try:
        try:
            with (client_factory or _default_client)(cfg) as client:
                result = _publish(ctx, client, force)
        except (SyncError, httpx.HTTPError) as exc:
            msg = str(exc) if isinstance(exc, SyncError) else f"Could not reach the website ({exc.__class__.__name__}). Check the internet connection."
            log.warning("website publish failed: %s", msg)
            with ctx.store.transaction() as tx:
                doc = tx.doc(STATE)
                doc["last_error"] = msg
                doc["last_error_at"] = started
            raise ValidationFailed(f"Publishing to the website failed: {msg}")
        result.update({"started_at": started, "finished_at": now_iso(), "trigger": trigger, "forced": force})
        log.info("website publish: %s", result)
        return result
    finally:
        _run_lock.release()


def _publish(ctx: AppContext, client: httpx.Client, force: bool) -> dict:
    store = ctx.store
    st = store.doc(STATE) or {}
    old_products: dict[str, dict] = dict(st.get("products") or {})

    # 1. Categories and sub-categories (few, always sent so names and on/off stay right).
    cats = store.all("categories")
    cat_ids = {r["local_id"]: r["id"] for r in _upsert(client, "categories", [category_payload(c) for c in cats], "publish categories")} if cats else {}
    subs = [s for s in store.all("subcategories") if s.get("category_id") in cat_ids]
    sub_ids = {}
    if subs:
        rows = [subcategory_payload(s, cat_ids[s["category_id"]]) for s in subs]
        sub_ids = {r["local_id"]: r["id"] for r in _upsert(client, "subcategories", rows, "publish sub-categories")}

    # 2. Products: photos first, then only the changed rows.
    photos_dir = ctx.settings.uploads_dir / "products"
    new_state: dict[str, dict] = {}
    changed: list[dict] = []
    uploaded = 0
    stale_photos: list[str] = []
    for p in store.all("products"):
        prev = old_products.get(p["id"], {})
        image_path = None
        if p.get("image"):
            version = int(p.get("image_version") or 0)
            if prev.get("image_version") == version and prev.get("image_path") and not force:
                image_path = prev["image_path"]
            else:
                file = photos_dir / os.path.basename(p["image"])
                if file.is_file():
                    image_path = f"shop/{_safe_name(p['sku'])}-v{version}.jpg"
                    _upload_photo(client, image_path, file.read_bytes())
                    uploaded += 1
                    if prev.get("image_path") and prev["image_path"] != image_path:
                        stale_photos.append(prev["image_path"])
        elif prev.get("image_path"):
            stale_photos.append(prev["image_path"])

        payload = product_payload(p, cat_ids, sub_ids, image_path)
        fp = _fingerprint(payload)
        new_state[p["id"]] = {"hash": fp, "image_version": int(p.get("image_version") or 0) if image_path else None,
                              "image_path": image_path}
        if force or prev.get("hash") != fp:
            changed.append(payload)

    if changed:
        _upsert(client, "products", changed, "publish products")
    _delete_photos(client, stale_photos)

    finished = now_iso()
    _check(client.patch("/rest/v1/store_settings", params={"id": "eq.1"},
                        headers={"Content-Type": "application/json", "Prefer": "return=minimal"},
                        content=json.dumps({"last_sync_at": _ist(finished)})), "update the publish time")

    result = {
        "categories": len(cats),
        "products_sent": len(changed),
        "products_total": len(new_state),
        "photos_uploaded": uploaded,
    }
    with store.transaction() as tx:
        doc = tx.doc(STATE)
        doc.clear()
        doc.update({"products": new_state, "last_success": finished, "last_result": result,
                    "last_error": None, "last_error_at": None})
    return result


class AutoPublish:
    """Background thread: publishes changes to the website every few minutes (when connected)."""

    def __init__(self, ctx: AppContext):
        self.ctx = ctx
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="website-publish", daemon=True)

    def start(self) -> None:
        cfg = load_config()
        if cfg.configured and cfg.minutes > 0:
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        self._stop.wait(20)  # let the application finish starting
        while not self._stop.is_set():
            try:
                if self.ctx.store.all("users"):
                    run_sync(self.ctx, trigger="auto")
            except ValidationFailed as exc:
                log.info("automatic website publish skipped: %s", exc.message)
            except Exception:
                log.exception("automatic website publish failed")
            self._stop.wait(max(60.0, load_config().minutes * 60))
