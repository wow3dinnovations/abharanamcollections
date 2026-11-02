"""Publishing the catalog to the customer website (Supabase), with the website faked in memory."""
from __future__ import annotations

import io
import json
import uuid

import httpx
import pytest
from PIL import Image

from app.services import website_sync
from tests.helpers import basic_setup, make_product, ok


class FakeWebsite:
    """Just enough of Supabase (PostgREST + Storage) to check what the shop sends."""

    def __init__(self):
        self.tables: dict[str, dict[str, dict]] = {"categories": {}, "subcategories": {}, "products": {}}
        self.photos: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.settings_patches: list[dict] = []
        self.product_posts = 0
        self.fail_with: int | None = None

    def handler(self, request: httpx.Request) -> httpx.Response:
        if self.fail_with:
            return httpx.Response(self.fail_with, json={"message": "nope"})
        assert request.headers["apikey"] == "service-key"
        path = request.url.path
        if path.startswith("/rest/v1/store_settings"):
            self.settings_patches.append(json.loads(request.content))
            return httpx.Response(204)
        if path.startswith("/rest/v1/"):
            table = path.rsplit("/", 1)[1]
            assert request.url.params["on_conflict"] == "local_id"
            rows = json.loads(request.content)
            if table == "products":
                self.product_posts += 1
            out = []
            for r in rows:
                existing = self.tables[table].get(r["local_id"])
                rid = existing["id"] if existing else str(uuid.uuid4())
                self.tables[table][r["local_id"]] = {**(existing or {}), **r, "id": rid}
                out.append({"id": rid, "local_id": r["local_id"]})
            return httpx.Response(201, json=out)
        if path.startswith("/storage/v1/object/catalog/") and request.method == "POST":
            self.photos[path.removeprefix("/storage/v1/object/catalog/")] = request.content
            return httpx.Response(200, json={"Key": path})
        if path == "/storage/v1/object/catalog" and request.method == "DELETE":
            self.deleted.extend(json.loads(request.content)["prefixes"])
            return httpx.Response(200, json=[])
        return httpx.Response(404, json={"message": f"unexpected {request.method} {path}"})

    def factory(self, cfg):
        return httpx.Client(base_url=cfg.url, headers={"apikey": cfg.key}, transport=httpx.MockTransport(self.handler))


@pytest.fixture()
def site(monkeypatch):
    monkeypatch.setenv("WEBSITE_SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("WEBSITE_SUPABASE_SERVICE_KEY", "service-key")
    fake = FakeWebsite()
    monkeypatch.setattr(website_sync, "_default_client", fake.factory)
    return fake


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), (200, 160, 40)).save(buf, format="JPEG")
    return buf.getvalue()


def test_not_connected_gives_a_clear_message(admin, monkeypatch):
    monkeypatch.delenv("WEBSITE_SUPABASE_URL", raising=False)
    monkeypatch.delenv("WEBSITE_SUPABASE_SERVICE_KEY", raising=False)
    assert ok(admin.get("/api/website/status"))["configured"] is False
    r = admin.post("/api/website/publish", json={})
    assert r.status_code == 422 and "not connected" in r.json()["detail"]


def test_publish_sends_safe_fields_only_and_then_only_changes(admin, site):
    cat, vendor, loc = basic_setup(admin)
    p = make_product(admin, cat, vendor, loc, description="Temple design", collection="Bridal")
    ok(admin.post(f"/api/products/{p['id']}/image", files={"file": ("a.jpg", _jpeg(), "image/jpeg")}))

    res = ok(admin.post("/api/website/publish", json={}))
    assert res["products_sent"] == 1 and res["photos_uploaded"] == 1

    sent = site.tables["products"][p["id"]]
    assert sent["sku"] == p["sku"] and sent["price"] == 699 and sent["stock_qty"] == 10
    assert sent["collection"] == "Bridal" and sent["description"] == "Temple design" and sent["is_active"] is True
    assert sent["category_id"] == site.tables["categories"][cat["id"]]["id"]
    assert sent["image_paths"] == [f"shop/{p['sku']}-v1.jpg"] and sent["image_paths"][0] in site.photos
    # Nothing secret leaves the shop.
    blob = json.dumps(site.tables)
    for secret in ("purchase_rate", "vendor", "location", "300", vendor["id"], loc["id"]):
        assert secret not in blob, secret
    assert site.settings_patches and "last_sync_at" in site.settings_patches[-1]

    # Nothing changed: nothing re-sent.
    posts = site.product_posts
    assert ok(admin.post("/api/website/publish", json={}))["products_sent"] == 0
    assert site.product_posts == posts

    # Stock change (a sale or adjustment) is published on the next run.
    ok(admin.post("/api/inventory/set-quantity", json={"product_id": p["id"], "location_id": loc["id"], "new_quantity": 4,
                                                 "reason": "COUNT_CORRECTION"}))
    assert ok(admin.post("/api/website/publish", json={}))["products_sent"] == 1
    assert site.tables["products"][p["id"]]["stock_qty"] == 4

    # A new photo gets a new file name and the old one is removed.
    ok(admin.post(f"/api/products/{p['id']}/image", files={"file": ("b.jpg", _jpeg(), "image/jpeg")}))
    ok(admin.post("/api/website/publish", json={}))
    assert site.tables["products"][p["id"]]["image_paths"] == [f"shop/{p['sku']}-v2.jpg"]
    assert f"shop/{p['sku']}-v1.jpg" in site.deleted

    st = ok(admin.get("/api/website/status"))
    assert st["configured"] and st["published_products"] == 1 and st["last_error"] is None


def test_inactive_product_is_hidden_and_force_resends_everything(admin, site):
    cat, vendor, loc = basic_setup(admin)
    p = make_product(admin, cat, vendor, loc)
    ok(admin.post("/api/website/publish", json={}))
    ok(admin.put(f"/api/products/{p['id']}", json={"status": "inactive"}))
    ok(admin.post("/api/website/publish", json={}))
    assert site.tables["products"][p["id"]]["is_active"] is False
    assert ok(admin.post("/api/website/publish", json={"force": True}))["products_sent"] == 1


def test_refused_key_is_reported_and_remembered(admin, site):
    basic_setup(admin)
    site.fail_with = 401
    r = admin.post("/api/website/publish", json={})
    assert r.status_code == 422 and "key was refused" in r.json()["detail"]
    assert "key was refused" in ok(admin.get("/api/website/status"))["last_error"]


def test_staff_need_publish_permission(admin, make_staff, site):
    staff = make_staff(["inventory.view"])
    assert staff.get("/api/website/status").status_code == 403
    assert staff.post("/api/website/publish", json={}).status_code == 403
    allowed = make_staff(["website.publish"])
    assert allowed.get("/api/website/status").status_code == 200
