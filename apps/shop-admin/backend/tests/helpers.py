"""Shared helpers for building test data through the real API."""
from __future__ import annotations


def ok(resp, code=200):
    assert resp.status_code == code, f"{resp.status_code}: {resp.text}"
    return resp.json()


def make_category(c, name="Earrings", code="EAR"):
    return ok(c.post("/api/categories", json={"name": name, "code": code}))


def make_vendor(c, name="Test Vendor"):
    return ok(c.post("/api/vendors", json={"name": name}))


def make_location(c, name="Nandyal"):
    return ok(c.post("/api/locations", json={"name": name}))


def basic_setup(c):
    return make_category(c), make_vendor(c), make_location(c)


def make_product(c, cat, vendor, loc, **over):
    body = {"name": "Test Gold Jhumka", "category_id": cat["id"], "vendor_id": vendor["id"],
            "purchase_location_id": loc["id"], "purchase_rate": 300, "selling_price": 699, "initial_quantity": 10}
    body.update(over)
    return ok(c.post("/api/products", json=body))
