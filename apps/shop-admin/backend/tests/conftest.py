from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import load_settings  # noqa: E402
from app.main import create_app  # noqa: E402

ADMIN_PW = "Admin@12345"


@pytest.fixture()
def settings(tmp_path):
    s = load_settings(tmp_path, write_env=False)
    s.password_scrypt_n = 16          # fast hashing for tests only
    return s


@pytest.fixture()
def app(settings):
    application = create_app(settings, auto_backup=False)
    with TestClient(application):      # runs start-up / shut-down
        yield application


@pytest.fixture()
def ctx(app):
    return app.state.ctx


@pytest.fixture()
def client(app):
    return TestClient(app)


@pytest.fixture()
def admin(app):
    c = TestClient(app)
    r = c.post("/api/auth/setup", json={"username": "owner", "password": ADMIN_PW, "full_name": "Shop Owner"})
    assert r.status_code == 200, r.text
    return c


@pytest.fixture()
def make_staff(app, admin):
    """Create a staff user with the given permissions and return a logged-in client for them."""
    counter = {"n": 0}

    def _make(permissions=(), **extra):
        counter["n"] += 1
        name = f"staff{counter['n']}"
        r = admin.post("/api/users", json={"username": name, "password": "Staff@12345", "full_name": name.title(),
                                           "permissions": list(permissions), **extra})
        assert r.status_code == 200, r.text
        c = TestClient(app)
        r = c.post("/api/auth/login", json={"username": name, "password": "Staff@12345"})
        assert r.status_code == 200, r.text
        c.user_id = r.json()["user"]["id"]
        return c

    return _make
