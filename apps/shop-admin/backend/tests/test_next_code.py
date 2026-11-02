"""Suggested product code when adding products one vendor at a time."""
from __future__ import annotations

from app.services.product_service import _bump
from tests.helpers import basic_setup, make_category, make_location, make_product, make_vendor, ok


def nxt(c, cat, vendor, loc):
    return ok(c.get("/api/products/next-code", params={"category_id": cat["id"], "vendor_id": vendor["id"] if vendor else "",
                                                       "location_id": loc["id"] if loc else ""}))


def test_bump_keeps_prefix_and_zeros():
    assert _bump("IB4501") == "IB4502"
    assert _bump("IH615-LOT009") == "IH615-LOT010"
    assert _bump("EAR-0099") == "EAR-0100"
    assert _bump("IBRC") == "IBRC1"


def test_follows_last_product_of_same_category_vendor_location(admin):
    cat, vendor, loc = basic_setup(admin)
    other_vendor, other_loc, other_cat = make_vendor(admin, "Other"), make_location(admin, "Hyderabad"), make_category(admin, "Rings", "RNG")
    assert nxt(admin, cat, vendor, loc)["sku"] == ""                     # nothing yet -> automatic code
    make_product(admin, cat, vendor, loc, sku="IB4501")
    make_product(admin, cat, other_vendor, loc, sku="IB9001")
    make_product(admin, cat, vendor, other_loc, sku="IH7001")
    make_product(admin, other_cat, vendor, loc, sku="RB100")

    r = nxt(admin, cat, vendor, loc)
    assert r == {"sku": "IB4502", "based_on": "IB4501", "match": "category_vendor_location"}
    assert nxt(admin, cat, other_vendor, loc)["sku"] == "IB9002"
    assert nxt(admin, cat, vendor, other_loc)["sku"] == "IH7002"
    assert nxt(admin, other_cat, vendor, loc)["sku"] == "RB101"

    # Saving the suggestion moves it on; a code already taken is skipped.
    make_product(admin, cat, vendor, loc, sku="IB4502")
    make_product(admin, other_cat, other_vendor, other_loc, sku="IB4503")
    assert nxt(admin, cat, vendor, loc)["sku"] == "IB4504"


def test_new_vendor_falls_back_to_category_and_location(admin):
    cat, vendor, loc = basic_setup(admin)
    make_product(admin, cat, vendor, loc, sku="IB4501")
    newbie = make_vendor(admin, "New Vendor")
    r = nxt(admin, cat, newbie, loc)
    assert r["sku"] == "IB4502" and r["match"] == "category_location"


def test_needs_add_product_permission(make_staff, admin):
    cat, vendor, loc = basic_setup(admin)
    assert make_staff(["inventory.view"]).get("/api/products/next-code", params={"category_id": cat["id"]}).status_code == 403
