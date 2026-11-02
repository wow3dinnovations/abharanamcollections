"""'Add Stock' (increase by a number) and 'Adjust Stock' (set the counted quantity) - per product and location."""
from __future__ import annotations

import pytest

from app.core.errors import ValidationFailed
from tests.helpers import make_category, make_location, make_product, make_vendor, ok


def shop(admin, qty=5):
    cat, ven = make_category(admin), make_vendor(admin)
    A, B = make_location(admin, "Nandyal"), make_location(admin, "Warehouse")
    p = make_product(admin, cat, ven, A, initial_quantity=qty, purchase_rate=300, selling_price=799)
    return cat, ven, A, B, p


def stock(admin, p):
    return {r["location_name"]: r["quantity"] for r in ok(admin.get(f"/api/products/{p['id']}"))["stock_by_location"]}


def add(admin, p, loc, qty, **extra):
    return admin.post("/api/inventory/add-stock", json={"product_id": p["id"], "location_id": loc["id"], "quantity": qty, **extra})


def setq(admin, p, loc, new, **extra):
    return admin.post("/api/inventory/set-quantity", json={"product_id": p["id"], "location_id": loc["id"], "new_quantity": new,
                                                          "reason": "COUNT_CORRECTION", **extra})


def last_txn(ctx):
    return ctx.store.all("inventory_transactions")[-1]


def audit_actions(ctx):
    return [a["action"] for a in ctx.store.all("audit_logs")]


# =============================================================== ADD STOCK
def test_add_stock_as_purchase_with_rate_and_vendor(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    n_purchases = len(ctx.store.all("purchases"))
    r = ok(add(admin, p, A, 3, purchase_rate=330, vendor_id=ven["id"], remarks="Extra pieces from Chennai trip"))
    assert (r["previous_stock"], r["new_stock"], r["quantity"], r["kind"]) == (5, 8, 3, "PURCHASE") and r["purchase_id"].startswith("PUR-")
    assert stock(admin, p) == {"Nandyal": 8}
    t = last_txn(ctx)                                                   # the stock history line
    assert (t["type"], t["quantity"], t["previous_stock"], t["new_stock"], t["location_name"], t["username"]) == ("PURCHASE", 3, 5, 8, "Nandyal", "owner")
    assert "Extra pieces from Chennai trip" in t["remarks"] and t["reference_id"] == r["purchase_id"] and t["date_time"]
    pur = ok(admin.get(f"/api/purchases/{r['purchase_id']}"))          # and it is a real purchase (reports stay right)
    assert pur["source"] == "stock_add" and pur["total"] == 990 and pur["vendor_name"] == "Test Vendor" and pur["location_name"] == "Nandyal"
    assert len(ctx.store.all("purchases")) == n_purchases + 1
    prod = ok(admin.get(f"/api/products/{p['id']}"))
    assert prod["purchase_rate"] == 311.25 and prod["last_purchase_rate"] == 330        # (5*300 + 3*330) / 8
    acts = audit_actions(ctx)
    assert "INVENTORY_CHANGED" in acts and "PURCHASE_ADDED" in acts
    entry = [a for a in ctx.store.all("audit_logs") if a["action"] == "INVENTORY_CHANGED"][-1]
    assert "Add Stock" in entry["details"] and "5 -> 8" in entry["details"] and entry["username"] == "owner"


def test_add_stock_blank_rate_keeps_the_cost(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    r = ok(add(admin, p, A, 4))                                        # no rate, no vendor, no remarks
    prod = ok(admin.get(f"/api/products/{p['id']}"))
    assert prod["current_quantity"] == 9 and prod["purchase_rate"] == 300 and prod["last_purchase_rate"] == 300
    assert ok(admin.get(f"/api/purchases/{r['purchase_id']}"))["total"] == 1200        # valued at the current cost


def test_add_stock_to_a_location_that_had_none(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    r = ok(add(admin, p, B, 2))
    assert (r["previous_stock"], r["new_stock"]) == (0, 2) and stock(admin, p) == {"Nandyal": 5, "Warehouse": 2}


def test_add_stock_other_is_a_plain_increase(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    n_purchases = len(ctx.store.all("purchases"))
    r = ok(add(admin, p, A, 2, kind="OTHER", remarks="Found in the display cabinet"))
    assert r["purchase_id"] == "" and stock(admin, p) == {"Nandyal": 7}
    t = last_txn(ctx)
    assert (t["type"], t["quantity"], t["previous_stock"], t["new_stock"]) == ("OTHER", 2, 5, 7) and "Found in the display cabinet" in t["remarks"]
    assert len(ctx.store.all("purchases")) == n_purchases                                    # NOT a purchase
    assert ok(admin.get(f"/api/products/{p['id']}"))["purchase_rate"] == 300                # cost untouched
    assert add(admin, p, A, 1, kind="OTHER").status_code == 422                              # remarks are needed for 'other'
    assert add(admin, p, A, 1, kind="OTHER", remarks="   ").status_code == 422
    assert add(admin, p, A, 1, kind="GIFT", remarks="x").status_code == 422


def test_add_stock_blocks_bad_quantities_and_changes_nothing(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    before = (len(ctx.store.all("inventory_transactions")), len(ctx.store.all("purchases")))
    for bad in (0, -1, -100):
        r = add(admin, p, A, bad)
        assert r.status_code == 422, bad
    assert add(admin, p, A, 2.5).status_code == 422                                         # whole pieces only
    assert add(admin, p, A, "abc").status_code == 422
    assert add(admin, p, A, 1, purchase_rate=-5).status_code == 422
    assert add(admin, p, A, 1, vendor_id="VEN-9999").status_code == 422
    assert stock(admin, p) == {"Nandyal": 5}
    assert (len(ctx.store.all("inventory_transactions")), len(ctx.store.all("purchases"))) == before


def test_add_stock_validates_product_and_location(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    assert admin.post("/api/inventory/add-stock", json={"product_id": "PRD-9", "location_id": A["id"], "quantity": 1}).status_code == 404
    assert admin.post("/api/inventory/add-stock", json={"product_id": p["id"], "location_id": "LOC-9", "quantity": 1}).status_code == 422
    assert admin.post("/api/inventory/add-stock", json={"product_id": p["id"], "location_id": "", "quantity": 1}).status_code == 422
    ok(admin.put(f"/api/locations/{B['id']}", json={"active": False}))                     # B holds no stock -> may be deactivated
    r = add(admin, p, B, 1)
    assert r.status_code == 422 and "inactive" in r.json()["detail"]
    ok(admin.post("/api/inventory/adjust", json={"product_id": p["id"], "location_id": A["id"], "quantity_change": -5, "reason_type": "OTHER", "remarks": "clear"}))
    ok(admin.delete(f"/api/products/{p['id']}"))
    assert add(admin, p, A, 1).status_code == 409                                           # deleted product


def test_add_stock_purchase_is_all_or_nothing(admin, ctx, settings):
    cat, ven, A, B, p = shop(admin)
    names = ("products", "purchases", "inventory_transactions", "audit_logs")
    revisions = {n: ctx.store.status()[n].revision for n in names}

    def crash(stage, name):
        if name == "audit_logs":
            raise OSError("disk full")

    ctx.store._fault_hook = crash
    from app.services import inventory_service
    with pytest.raises(Exception):
        inventory_service.add_stock(ctx, ctx.store.all("users")[0], p["id"], A["id"], 3, "PURCHASE", 330, ven["id"], "test")
    ctx.store._fault_hook = None
    assert stock(admin, p) == {"Nandyal": 5}
    assert {n: ctx.store.status()[n].revision for n in names} == revisions
    assert not list(settings.data_dir.glob("*.pre-txn"))
    ok(add(admin, p, A, 3))                                                               # works normally afterwards


# =============================================================== ADJUST STOCK (set the counted quantity)
def test_adjust_stock_sets_the_counted_quantity_down(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    r = ok(setq(admin, p, A, 3, remarks="Physical count on Sunday"))
    assert stock(admin, p) == {"Nandyal": 3}
    assert (r["type"], r["quantity"], r["previous_stock"], r["new_stock"]) == ("STOCK_ADJUSTMENT", -2, 5, 3)
    t = last_txn(ctx)
    assert t["type"] == "STOCK_ADJUSTMENT" and (t["previous_stock"], t["new_stock"], t["quantity"]) == (5, 3, -2)
    assert t["username"] == "owner" and t["date_time"] and t["location_name"] == "Nandyal"
    assert t["reason"] == "COUNT_CORRECTION" and t["reason_label"] == "Counting correction" and t["counted_quantity"] == 3
    assert "Counting correction" in t["remarks"] and "Physical count on Sunday" in t["remarks"]
    entry = [a for a in ctx.store.all("audit_logs") if a["action"] == "INVENTORY_CHANGED"][-1]
    assert "5 -> 3" in entry["details"] and "Counting correction" in entry["details"] and entry["username"] == "owner"


def test_adjust_stock_up_and_to_zero(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    assert ok(setq(admin, p, A, 9))["quantity"] == 4 and stock(admin, p) == {"Nandyal": 9}
    ok(setq(admin, p, A, 0, reason="LOST", remarks="Cannot find any"))
    assert stock(admin, p) == {} and ok(admin.get(f"/api/products/{p['id']}"))["is_out_of_stock"] is True
    assert last_txn(ctx)["new_stock"] == 0 and last_txn(ctx)["reason"] == "LOST"
    ok(setq(admin, p, B, 4))                                                               # a location that had no stock
    assert stock(admin, p) == {"Warehouse": 4} and (last_txn(ctx)["previous_stock"], last_txn(ctx)["new_stock"]) == (0, 4)


def test_adjust_stock_reasons_and_their_rules(admin, ctx):
    cat, ven, A, B, p = shop(admin, qty=10)
    ok(setq(admin, p, A, 9, reason="DAMAGE", remarks="Clasp broke"))
    ok(setq(admin, p, A, 8, reason="LOST"))
    assert setq(admin, p, A, 12, reason="DAMAGE").status_code == 422                       # damaged/lost cannot raise the stock
    assert setq(admin, p, A, 12, reason="LOST").status_code == 422
    assert setq(admin, p, A, 7, reason="OTHER").status_code == 422                          # 'other' needs an explanation
    ok(setq(admin, p, A, 7, reason="OTHER", remarks="Sent as a sample to a customer"))
    assert setq(admin, p, A, 6, reason="BECAUSE").status_code == 422                        # unknown reason
    assert stock(admin, p) == {"Nandyal": 7}
    labels = [t["reason_label"] for t in ctx.store.all("inventory_transactions") if t.get("reason")]
    assert labels == ["Damaged", "Lost", "Other"]
    assert all(t["type"] == "STOCK_ADJUSTMENT" for t in ctx.store.all("inventory_transactions") if t.get("reason"))


def test_adjust_stock_blocks_negative_and_no_change(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    n = len(ctx.store.all("inventory_transactions"))
    for bad in (-1, -50):
        r = setq(admin, p, A, bad)
        assert r.status_code == 422 and "negative" in r.json()["detail"]
    assert setq(admin, p, A, 5).status_code == 422                                          # already 5: nothing to change
    assert setq(admin, p, A, 3.5).status_code == 422
    assert setq(admin, p, A, "many").status_code == 422
    assert setq(admin, p, {"id": ""}, 3).status_code == 422                                # no location chosen
    assert setq(admin, p, {"id": "LOC-9"}, 3).status_code == 422
    assert stock(admin, p) == {"Nandyal": 5} and len(ctx.store.all("inventory_transactions")) == n


def test_adjust_stock_does_not_touch_sales_history_or_other_locations(admin, ctx):
    cat, ven, A, B, p = shop(admin)
    ok(add(admin, p, B, 3))
    ok(admin.post("/api/sales", json={"payment_method": "Cash", "items": [{"product_id": p["id"], "quantity": 2}]}))
    sold_before = ok(admin.get(f"/api/products/{p['id']}"))["sold_quantity"]
    ok(setq(admin, p, A, 1))
    prod = ok(admin.get(f"/api/products/{p['id']}"))
    assert prod["sold_quantity"] == sold_before == 2 and prod["initial_quantity"] == 5
    assert stock(admin, p) == {"Nandyal": 1, "Warehouse": 3}                                # only Nandyal changed
    assert ok(admin.get("/api/data/health"))["status"] in ("ok", "warning")               # stock still equals its history, per location


def test_stock_history_screen_data_shows_both_operations(admin):
    cat, ven, A, B, p = shop(admin)
    ok(add(admin, p, A, 2)); ok(setq(admin, p, A, 4, reason="DAMAGE", remarks="water damage"))
    rows = ok(admin.get(f"/api/inventory/transactions?product_id={p['id']}"))["items"]
    assert [(r["type"], r["previous_stock"], r["new_stock"]) for r in rows[:2]] == [("STOCK_ADJUSTMENT", 7, 4), ("PURCHASE", 5, 7)]
    assert ok(admin.get("/api/inventory/transactions?type=STOCK_ADJUSTMENT"))["total"] == 1


def test_service_level_validation_messages():
    """The rules also hold when the service is called directly (not only through the web address)."""
    from app.services import inventory_service
    with pytest.raises(ValidationFailed):
        inventory_service.set_quantity(None, {}, "p", "l", -1, "COUNT_CORRECTION")
    with pytest.raises(ValidationFailed):
        inventory_service.add_stock(None, {}, "p", "l", 0)


# =============================================================== PERMISSIONS
def test_only_people_with_adjust_permission_can_add_or_adjust(admin, make_staff, ctx):
    cat, ven, A, B, p = shop(admin)
    nobody = make_staff(["inventory.view", "inventory.edit_product", "purchases.add"])
    assert add(nobody, p, A, 1).status_code == 403 and setq(nobody, p, A, 1).status_code == 403
    assert nobody.post("/api/inventory/adjust", json={"product_id": p["id"], "location_id": A["id"], "quantity_change": 1, "remarks": "x"}).status_code == 403
    assert stock(admin, p) == {"Nandyal": 5}
    counter = make_staff(["inventory.view", "inventory.adjust_stock"])
    r = ok(add(counter, p, A, 2))                                                           # allowed, plain quantity only
    assert r["new_stock"] == 7
    assert add(counter, p, A, 1, purchase_rate=100).status_code == 403                      # cost information needs cost permission
    assert add(counter, p, A, 1, vendor_id=ven["id"]).status_code == 403
    ok(setq(counter, p, A, 6, remarks="counted"))
    assert stock(admin, p) == {"Nandyal": 6}
    who = [(a["username"], a["action"]) for a in ctx.store.all("audit_logs") if a["action"] == "INVENTORY_CHANGED"]
    assert ("staff2", "INVENTORY_CHANGED") in who                                            # the staff member is on the audit trail
    manager = make_staff(["inventory.view", "inventory.adjust_stock", "purchases.view"])    # can see cost -> may enter a rate
    assert add(manager, p, A, 1, purchase_rate=310).status_code == 200


def test_login_required(client):
    assert client.post("/api/inventory/add-stock", json={"product_id": "x", "location_id": "y", "quantity": 1}).status_code == 401
    assert client.post("/api/inventory/set-quantity", json={"product_id": "x", "location_id": "y", "new_quantity": 1}).status_code == 401
