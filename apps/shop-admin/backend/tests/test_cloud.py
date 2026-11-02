"""Online mode against a real (local) Supabase.

Runs only when SHOP_CLOUD_TEST_URL and SHOP_CLOUD_TEST_KEY point at a Supabase with the migrations applied
(CI starts one with `supabase start`; locally: `npx supabase start`, then use the API URL and secret key).
"""
from __future__ import annotations

import io
import os

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import load_settings
from app.main import create_app
from app.storage.registry import SPECS
from tests.helpers import basic_setup, make_product, ok

URL = os.environ.get("SHOP_CLOUD_TEST_URL", "").rstrip("/")
KEY = os.environ.get("SHOP_CLOUD_TEST_KEY", "")
pytestmark = pytest.mark.skipif(not (URL and KEY), reason="no test Supabase (set SHOP_CLOUD_TEST_URL / SHOP_CLOUD_TEST_KEY)")
PW = "Admin@12345"


def _client() -> httpx.Client:
    headers = {"apikey": KEY}
    if KEY.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {KEY}"
    return httpx.Client(base_url=URL, headers=headers, timeout=30)


@pytest.fixture()
def online(monkeypatch):
    """A clean online copy, and a function that starts a fresh 'container' (empty disk) against it."""
    monkeypatch.setenv("SHOP_CLOUD", "1")
    monkeypatch.setenv("WEBSITE_SUPABASE_URL", URL)
    monkeypatch.setenv("WEBSITE_SUPABASE_SERVICE_KEY", KEY)
    monkeypatch.setenv("WEBSITE_SYNC_MINUTES", "0")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with _client() as c:
        r = c.post("/rest/v1/rpc/shop_store_replace",
                   json={"p_cols": [{"c": s.name, "rev": 0, "records": [], "doc": None} for s in SPECS]})
        assert r.status_code < 300, r.text
        listed = c.post("/storage/v1/object/list/shop-files", json={"prefix": "", "limit": 1000})
        from app.storage.cloud import FileMirror
        files = [f for top in listed.json() for f in FileMirror(c, ".")._list(top["name"])] if listed.status_code == 200 else []
        if files:
            c.request("DELETE", "/storage/v1/object/shop-files", json={"prefixes": files})

    opened = []

    def start(tmp_path):
        s = load_settings(tmp_path, write_env=False)
        s.password_scrypt_n = 16
        app = create_app(s, auto_backup=False)
        tc = TestClient(app, base_url="https://testserver")      # online the login cookie is https-only
        tc.__enter__()
        opened.append(tc)
        return app, tc

    yield start
    for tc in opened:
        tc.__exit__(None, None, None)


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (30, 30), (180, 140, 30)).save(buf, format="JPEG")
    return buf.getvalue()


def _login(tc):
    ok(tc.post("/api/auth/login", json={"username": "owner", "password": PW}))
    return tc


def test_data_and_photos_survive_a_new_container(online, tmp_path):
    app, a = online(tmp_path / "one")
    ok(a.post("/api/auth/setup", json={"username": "owner", "password": PW, "full_name": "Owner"}))
    cat, vendor, loc = basic_setup(a)
    p = make_product(a, cat, vendor, loc, sku="IB4501")
    ok(a.post(f"/api/products/{p['id']}/image", files={"file": ("a.jpg", _jpeg(), "image/jpeg")}))
    ok(a.put(f"/api/products/{p['id']}", json={"name": "Temple Jhumka"}))
    a.__exit__(None, None, None)                      # container stops: last files are uploaded

    _, b = online(tmp_path / "two")                   # brand-new empty disk
    b = _login(b)
    got = ok(b.get(f"/api/products/{p['id']}"))
    assert got["name"] == "Temple Jhumka" and got["sku"] == "IB4501"
    assert b.get(got["image_url"]).status_code == 200
    assert ok(b.get("/api/products/next-code", params={"category_id": cat["id"], "vendor_id": vendor["id"],
                                                         "location_id": loc["id"]}))["sku"] == "IB4502"
    # Ids keep counting from where they were.
    q = make_product(b, cat, vendor, loc)
    assert q["id"] != p["id"]


def test_a_stale_copy_cannot_overwrite(online, tmp_path):
    _, a = online(tmp_path / "one")
    ok(a.post("/api/auth/setup", json={"username": "owner", "password": PW, "full_name": "Owner"}))
    cat, vendor, loc = basic_setup(a)
    _, b = online(tmp_path / "two")
    b = _login(b)                                     # the second copy saves (login) -> the first one is now stale
    body = {"name": "X", "category_id": cat["id"], "purchase_rate": 1, "selling_price": 2}
    r = a.post("/api/products", json={**body, "sku": "IB1"})
    assert r.status_code == 409 and "another copy" in r.json()["detail"]
    ok(a.post("/api/products", json={**body, "sku": "IB1"}))       # it reloaded itself: trying again works
    r = b.post("/api/products", json={**body, "sku": "IB2"})
    assert r.status_code == 409
    ok(b.post("/api/products", json={**body, "sku": "IB2"}))
    assert {p["sku"] for p in ok(b.get("/api/products"))["items"]} == {"IB1", "IB2"}


def test_restore_is_saved_online(online, tmp_path):
    _, a = online(tmp_path / "one")
    ok(a.post("/api/auth/setup", json={"username": "owner", "password": PW, "full_name": "Owner"}))
    cat, vendor, loc = basic_setup(a)
    make_product(a, cat, vendor, loc, sku="KEEP1")
    backup = ok(a.post("/api/data/backup", json={"reason": "before test"}))
    make_product(a, cat, vendor, loc, sku="LOSE1")
    ok(a.post("/api/data/restore", json={"name": backup["name"], "confirm": True, "confirm_text": "RESTORE"}))
    make_product(a, cat, vendor, loc, sku="AFTER1")      # saving after a restore still works
    a.__exit__(None, None, None)

    _, b = online(tmp_path / "two")
    b = _login(b)
    skus = {p["sku"] for p in ok(b.get("/api/products"))["items"]}
    assert skus == {"KEEP1", "AFTER1"}
    assert any(x["name"] == backup["name"] for x in ok(b.get("/api/data/backups"))["items"])


def test_nothing_changes_when_online_save_fails(online, tmp_path, monkeypatch):
    app, a = online(tmp_path / "one")
    ok(a.post("/api/auth/setup", json={"username": "owner", "password": PW, "full_name": "Owner"}))
    cat, vendor, loc = basic_setup(a)
    store = app.state.ctx.store
    store.remote.client.headers["apikey"] = "wrong-key"
    store.remote.client.headers.pop("Authorization", None)
    r = a.post("/api/products", json={"name": "X", "category_id": cat["id"], "purchase_rate": 1, "selling_price": 2})
    assert r.status_code == 500 and "Nothing was changed" in r.json()["detail"]
    store.remote.client.headers["apikey"] = KEY
    if KEY.startswith("eyJ"):
        store.remote.client.headers["Authorization"] = f"Bearer {KEY}"
    assert ok(a.get("/api/products"))["total"] == 0


def test_one_time_upload_from_the_shop_computer(online, tmp_path, monkeypatch):
    """The shop computer's data (opened locally) goes online; a fresh container then has all of it."""
    import upload_to_cloud
    from app.core.config import load_settings as _ls

    monkeypatch.setenv("SHOP_CLOUD", "0")
    local = tmp_path / "shop-pc"
    s = _ls(local, write_env=False)
    s.password_scrypt_n = 16
    app = create_app(s, auto_backup=False)
    with TestClient(app) as pc:
        ok(pc.post("/api/auth/setup", json={"username": "owner", "password": PW, "full_name": "Owner"}))
        cat, vendor, loc = basic_setup(pc)
        p = make_product(pc, cat, vendor, loc, sku="IH6171")
        ok(pc.post(f"/api/products/{p['id']}/image", files={"file": ("a.jpg", _jpeg(), "image/jpeg")}))
    assert upload_to_cloud.main(local, assume_yes=True) == 0

    monkeypatch.setenv("SHOP_CLOUD", "1")
    _, b = online(tmp_path / "container")
    b = _login(b)
    got = ok(b.get(f"/api/products/{p['id']}"))
    assert got["sku"] == "IH6171" and b.get(got["image_url"]).status_code == 200
