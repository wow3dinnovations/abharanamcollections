"""Login, permissions, staff, settings, backup and restore (Phase 1 + 7 basics)."""
from __future__ import annotations

import json


def test_first_time_setup_then_login_and_logout(client):
    assert client.get("/api/auth/setup-status").json()["needs_setup"] is True
    assert client.get("/api/auth/me").status_code == 401
    r = client.post("/api/auth/setup", json={"username": "owner", "password": "Secret@123", "full_name": "Owner"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
    assert "password_hash" not in r.json()["user"]
    assert client.get("/api/auth/me").status_code == 200
    # set-up can only happen once
    assert client.post("/api/auth/setup", json={"username": "x", "password": "Secret@123"}).status_code == 403
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_password_is_hashed_not_plain(admin, settings):
    raw = (settings.data_dir / "users.json").read_text(encoding="utf-8")
    assert "Admin@12345" not in raw and "scrypt$" in raw


def test_wrong_password_and_lockout(admin, client):
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "owner", "password": "bad"}).status_code == 401
    r = client.post("/api/auth/login", json={"username": "owner", "password": "Admin@12345"})
    assert r.status_code == 429


def test_weak_password_rejected(client):
    r = client.post("/api/auth/setup", json={"username": "owner", "password": "12345678"})
    assert r.status_code == 422


def test_protected_routes_need_login(client):
    for path in ("/api/users", "/api/settings", "/api/data/summary"):
        assert client.get(path).status_code == 401


def test_staff_permissions_enforced_in_backend(admin, make_staff):
    staff = make_staff([])
    assert staff.get("/api/users").status_code == 403
    assert staff.get("/api/data/summary").status_code == 403
    assert staff.post("/api/data/backup", json={}).status_code == 403
    assert staff.put("/api/settings", json={"business": {"name": "Hacked"}}).status_code == 403
    admin.put(f"/api/users/{staff.user_id}", json={"permissions": ["admin.backup"]})
    # permission changes take effect on the next login (old session is signed out)
    assert staff.get("/api/auth/me").status_code == 401
    r = staff.post("/api/auth/login", json={"username": "staff1", "password": "Staff@12345"})
    assert r.status_code == 200
    assert staff.post("/api/data/backup", json={}).status_code == 200
    assert staff.post("/api/data/restore", json={"name": "x"}).status_code == 403


def test_manage_staff_cannot_grant_permissions_they_lack(admin, make_staff):
    manager = make_staff(["admin.staff"])
    r = manager.post("/api/users", json={"username": "sneaky", "password": "Staff@12345",
                                         "permissions": ["admin.restore"]})
    assert r.status_code == 403
    r = manager.put(f"/api/users/{manager.user_id}", json={"permissions": ["admin.restore"]})
    assert r.status_code == 403


def test_disable_staff_and_admin_reset_password(admin, make_staff, app):
    from fastapi.testclient import TestClient
    staff = make_staff(["inventory.view"])
    assert admin.put(f"/api/users/{staff.user_id}", json={"active": False}).status_code == 200
    assert staff.get("/api/auth/me").status_code == 401
    other = TestClient(app)
    assert other.post("/api/auth/login", json={"username": "staff1", "password": "Staff@12345"}).status_code == 401
    admin.put(f"/api/users/{staff.user_id}", json={"active": True})
    assert admin.post(f"/api/users/{staff.user_id}/reset-password", json={"new_password": "NewPass@999"}).status_code == 200
    assert other.post("/api/auth/login", json={"username": "staff1", "password": "Staff@12345"}).status_code == 401
    assert other.post("/api/auth/login", json={"username": "staff1", "password": "NewPass@999"}).status_code == 200


def test_cannot_disable_last_admin(admin):
    me = admin.get("/api/auth/me").json()["user"]
    r = admin.put(f"/api/users/{me['id']}", json={"active": False})
    assert r.status_code == 409


def test_change_own_password(admin):
    r = admin.post("/api/auth/change-password", json={"current_password": "wrong", "new_password": "Another@123"})
    assert r.status_code == 422
    r = admin.post("/api/auth/change-password", json={"current_password": "Admin@12345", "new_password": "Another@123"})
    assert r.status_code == 200
    assert admin.get("/api/auth/me").status_code == 200       # cookie refreshed


def test_settings_update_and_validation(admin):
    r = admin.put("/api/settings", json={"business": {"address": "Nandyal"}, "inventory": {"low_stock_threshold": 5}})
    assert r.status_code == 200 and r.json()["business"]["address"] == "Nandyal"
    assert admin.get("/api/settings").json()["inventory"]["low_stock_threshold"] == 5
    assert admin.put("/api/settings", json={"inventory": {"low_stock_threshold": -1}}).status_code == 422
    assert admin.put("/api/settings", json={"billing": {"tax_mode": "weird"}}).status_code == 422


def test_backup_now_list_and_contents(admin, settings):
    r = admin.post("/api/data/backup", json={"reason": "test"})
    assert r.status_code == 200
    name = r.json()["name"]
    assert (settings.backup_dir / name / "users.json").exists()
    assert (settings.backup_dir / name / "manifest.json").exists()
    detail = admin.get(f"/api/data/backups/{name}").json()
    assert detail["problems"] == []
    assert any(f["name"] == "users.json" and f["records"] == 1 for f in detail["files"])
    assert admin.get("/api/data/backups").json()["items"][0]["name"] == name
    assert admin.get("/api/data/backups/backup_../../etc").status_code in (404, 422)


def test_restore_needs_confirmation_and_makes_safety_backup(admin, settings, ctx):
    name = admin.post("/api/data/backup", json={}).json()["name"]
    admin.post("/api/users", json={"username": "later", "password": "Later@1234"})
    assert len(ctx.store.all("users")) == 2
    r = admin.post("/api/data/restore", json={"name": name, "confirm": False})
    assert r.status_code == 422 and len(ctx.store.all("users")) == 2       # nothing changed
    r = admin.post("/api/data/restore", json={"name": name, "confirm": True, "confirm_text": "restore"})
    assert r.status_code == 200
    assert len(ctx.store.all("users")) == 1
    safety = r.json()["safety_backup"]
    users_in_safety = json.loads((settings.backup_dir / safety / "users.json").read_text(encoding="utf-8"))
    assert len(users_in_safety["records"]) == 2            # current data was saved first


def test_restore_refuses_damaged_backup(admin, settings, ctx):
    name = admin.post("/api/data/backup", json={}).json()["name"]
    (settings.backup_dir / name / "users.json").write_text("garbage", encoding="utf-8")
    r = admin.post("/api/data/restore", json={"name": name, "confirm": True, "confirm_text": "RESTORE"})
    assert r.status_code == 409
    assert len(ctx.store.all("users")) == 1


def test_corrupt_file_gives_clear_admin_message(admin, settings, ctx):
    ctx.store.close()
    (settings.data_dir / "sales.json").write_text("{{{", encoding="utf-8")
    ctx.store.open()
    summary = admin.get("/api/data/summary").json()
    assert summary["health"] == "corrupted" and "sales.json" in summary["corrupted_files"]
    assert admin.get("/api/health").json()["data_problem"] == ["sales.json"]


def test_auto_backup_prunes_old_automatic_backups_only(ctx):
    for _ in range(4):
        ctx.backups.create("auto")
    manual = ctx.backups.create("manual")
    assert ctx.backups.prune_auto(2) == 2
    names = [b["name"] for b in ctx.backups.list()]
    assert manual["name"] in names and len(names) == 3


def test_audit_log_written_for_login_and_staff(admin, ctx):
    actions = [a["action"] for a in ctx.store.all("audit_logs")]
    assert "STAFF_CREATED" in actions and "LOGIN" in actions


# ------------------------------------------------------------------ security hardening
def test_cross_site_requests_are_blocked(admin):
    evil = {"Origin": "http://evil.example"}
    r = admin.post("/api/data/backup", json={}, headers=evil)
    assert r.status_code == 403 and r.json()["code"] == "CROSS_SITE"
    assert admin.post("/api/data/backup", json={}, headers={"Origin": "http://testserver"}).status_code == 200      # same site is fine
    assert admin.post("/api/data/backup", json={}).status_code == 200                                              # no Origin header (scripts, tests)
    assert admin.get("/api/settings", headers=evil).status_code == 200                                              # reads are not changes


def test_developer_api_pages_are_off_by_default(client):
    assert client.get("/api/docs").status_code == 404 and client.get("/api/openapi.json").status_code == 404


def test_cookie_is_httponly_and_samesite(client):
    r = client.post("/api/auth/setup", json={"username": "owner", "password": "Secret@123"})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "abh_session=" in cookie


def test_oversized_uploads_are_refused_without_being_stored(admin, settings):
    big = b"\xff\xd8\xff" + b"0" * (7 * 1024 * 1024)
    cat = ok_(admin.post("/api/categories", json={"name": "Earrings", "code": "EAR"}))
    p = ok_(admin.post("/api/products", json={"name": "P", "category_id": cat["id"], "selling_price": 5}))
    r = admin.post(f"/api/products/{p['id']}/image", files={"file": ("big.jpg", big, "image/jpeg")})
    assert r.status_code == 422 and "too big" in r.json()["detail"]
    r = admin.post("/api/settings/logo", files={"file": ("logo.png", b"0" * (4 * 1024 * 1024), "image/png")})
    assert r.status_code == 422
    assert not list((settings.uploads_dir / "products").glob("*.jpg"))


def test_svg_logo_with_script_is_rejected(admin):
    bad = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    assert admin.post("/api/settings/logo", files={"file": ("logo.svg", bad, "image/svg+xml")}).status_code == 422
    good = b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'
    assert admin.post("/api/settings/logo", files={"file": ("logo.svg", good, "image/svg+xml")}).status_code == 200
    served = admin.get("/api/branding/logo")
    assert served.status_code == 200 and "sandbox" in served.headers["content-security-policy"]


def ok_(resp):
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_emergency_password_reset_tool(admin, settings, ctx, app):
    from fastapi.testclient import TestClient
    import pytest
    from app.core.errors import AppError
    import reset_password
    ctx.store.close()                                                    # the tool must run while the app is closed
    with pytest.raises(AppError):
        reset_password.reset_password(settings.base_dir, "nobody", "New@pass123", scrypt_n=16)
    with pytest.raises(AppError):
        reset_password.reset_password(settings.base_dir, "owner", "weak", scrypt_n=16)
    reset_password.reset_password(settings.base_dir, "OWNER", "Brand@new123", scrypt_n=16)
    ctx.store.open()
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": "owner", "password": "Admin@12345"}).status_code == 401       # old one is dead
    assert c.post("/api/auth/login", json={"username": "owner", "password": "Brand@new123"}).status_code == 200
    assert "PASSWORD_RESET" in [a["action"] for a in ctx.store.all("audit_logs")]
    assert admin.get("/api/auth/me").status_code == 401                                                             # old session signed out
