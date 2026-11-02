"""POS bills are NOT tied to one location: stock is taken from whichever location(s) hold it."""
from __future__ import annotations

import io

import pytest
from openpyxl import load_workbook

from app.services import sale_service
from tests.helpers import make_category, make_location, make_product, make_vendor, ok


def shop(admin):
    cat, ven = make_category(admin), make_vendor(admin)
    return cat, ven, make_location(admin, "Nandyal"), make_location(admin, "Warehouse")


def product_in(admin, cat, ven, stock: list, **over):
    """A product whose stock is [(location, pieces), ...], e.g. [(A, 5), (B, 3)]."""
    items = list(stock)
    first_loc, first_qty = items[0]
    p = make_product(admin, cat, ven, first_loc, initial_quantity=first_qty, **over)
    for loc, qty in items[1:]:
        ok(admin.post("/api/purchases", json={"vendor_id": ven["id"], "location_id": loc["id"],
                                              "items": [{"product_id": p["id"], "quantity": qty, "rate": 300}]}))
    return p


def by_name(admin, p):
    return {r["location_name"]: r["quantity"] for r in ok(admin.get(f"/api/products/{p['id']}"))["stock_by_location"]}


def sell(admin, p, qty, **extra):
    """Default = NO location given, i.e. 'All locations'."""
    return admin.post("/api/sales", json={"items": [{"product_id": p["id"], "quantity": qty}], "payment_method": "Cash", **extra})


def sale_txns(ctx, sale_id, kind):
    return [t for t in ctx.store.all("inventory_transactions") if t["reference_id"] == sale_id and t["type"] == kind]


# ------------------------------------------------------------------ 1-2: sale from All Locations
def test_sale_from_all_locations_when_stock_is_in_one_place(admin, ctx):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(B, 4)])                       # only the Warehouse has it
    s = ok(sell(admin, p, 3))
    assert by_name(admin, p) == {"Warehouse": 1}
    assert "location_id" not in s and "location_name" not in s    # a bill belongs to no single location
    assert s["items"][0]["allocations"] == [{"location_id": B["id"], "location_name": "Warehouse", "quantity": 3}]
    assert "location_id" not in s["items"][0]
    t = sale_txns(ctx, s["id"], "SALE")
    assert len(t) == 1 and t[0]["location_id"] == B["id"] and (t[0]["previous_stock"], t[0]["new_stock"], t[0]["quantity"]) == (4, 1, -3)


def test_explicit_all_keyword_is_the_same_as_blank(admin):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 2)])
    assert ok(sell(admin, p, 1, location_id="ALL"))["items"][0]["allocations"][0]["location_name"] == "Nandyal"


def test_product_split_across_two_locations_takes_the_biggest_first(admin, ctx):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5), (B, 3)])                 # Nandyal has the most
    s = ok(sell(admin, p, 6))
    assert by_name(admin, p) == {"Warehouse": 2}                  # Nandyal 5 taken, then Warehouse 1
    assert [(a["location_name"], a["quantity"]) for a in s["items"][0]["allocations"]] == [("Nandyal", 5), ("Warehouse", 1)]
    txns = sale_txns(ctx, s["id"], "SALE")
    assert sorted((t["location_name"], t["quantity"], t["previous_stock"], t["new_stock"]) for t in txns) == \
        [("Nandyal", -5, 5, 0), ("Warehouse", -1, 3, 2)]          # one history line per location touched
    assert all(t["reference_type"] == "sale" and t["username"] == "owner" for t in txns)
    prod = ok(admin.get(f"/api/products/{p['id']}"))
    assert prod["current_quantity"] == 2 and prod["sold_quantity"] == 6
    assert ok(admin.get("/api/data/health"))["status"] in ("ok", "warning")            # stock still equals stock history, per location


def test_allocation_rule_details(admin):
    cat, ven, A, B = shop(admin)
    big_b = product_in(admin, cat, ven, [(A, 2), (B, 7)], name="P1")
    s1 = ok(sell(admin, big_b, 3))
    assert [(a["location_name"], a["quantity"]) for a in s1["items"][0]["allocations"]] == [("Warehouse", 3)]        # B has more -> only B
    tie = product_in(admin, cat, ven, [(A, 4), (B, 4)], name="P2")
    s2 = ok(sell(admin, tie, 5))
    assert [(a["location_name"], a["quantity"]) for a in s2["items"][0]["allocations"]] == [("Nandyal", 4), ("Warehouse", 1)]   # tie: name order
    everything = product_in(admin, cat, ven, [(A, 1), (B, 1)], name="P3")
    s3 = ok(sell(admin, everything, 2))
    assert by_name(admin, everything) == {}
    assert {a["location_name"] for a in s3["items"][0]["allocations"]} == {"Nandyal", "Warehouse"}


def test_plan_allocation_function_directly():
    names = {"a": "Nandyal", "b": "Warehouse", "c": "Chennai"}
    assert sale_service.plan_allocation({"a": 5, "b": 3}, 6, names) == [("a", 5), ("b", 1)]
    assert sale_service.plan_allocation({"a": 1, "b": 9, "c": 4}, 12, names) == [("b", 9), ("c", 3)]
    assert sale_service.plan_allocation({"a": 4, "b": 4}, 4, names) == [("a", 4)]
    assert sale_service.plan_allocation({"a": 0, "b": 2}, 1, names) == [("b", 1)]
    with pytest.raises(ValueError):
        sale_service.plan_allocation({"a": 2, "b": 1}, 4, names)


# ------------------------------------------------------------------ 3: not enough in total
def test_insufficient_total_stock_is_blocked_with_a_clear_message(admin, ctx):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5), (B, 3)])
    before = (len(ctx.store.all("sales")), len(ctx.store.all("inventory_transactions")))
    r = sell(admin, p, 9)
    assert r.status_code == 409
    msg = r.json()["detail"]
    assert "8 available in total across all locations" in msg and "9 on the bill" in msg and "Nandyal 5" in msg and "Warehouse 3" in msg
    assert by_name(admin, p) == {"Nandyal": 5, "Warehouse": 3}                        # nothing was taken
    assert (len(ctx.store.all("sales")), len(ctx.store.all("inventory_transactions"))) == before
    assert ok(sell(admin, p, 8))["total"] == 8 * 699                                   # exactly the total is fine
    assert sell(admin, p, 1).status_code == 409                                        # and now it is out of stock everywhere


def test_one_short_item_blocks_the_whole_bill(admin, ctx):
    cat, ven, A, B = shop(admin)
    fine = product_in(admin, cat, ven, [(A, 5)], name="Fine")
    short = product_in(admin, cat, ven, [(B, 1)], name="Short")
    r = admin.post("/api/sales", json={"payment_method": "Cash", "items": [{"product_id": fine["id"], "quantity": 2}, {"product_id": short["id"], "quantity": 2}]})
    assert r.status_code == 409 and "Short" in r.json()["detail"]
    assert by_name(admin, fine) == {"Nandyal": 5} and ctx.store.all("sales") == []      # nothing partial


# ------------------------------------------------------------------ 4: one bill, several locations
def test_one_bill_can_take_items_from_different_locations(admin, ctx):
    cat, ven, A, B = shop(admin)
    x = product_in(admin, cat, ven, [(A, 3)], name="X only at Nandyal", selling_price=1000)
    y = product_in(admin, cat, ven, [(B, 3)], name="Y only at Warehouse", selling_price=500)
    z = product_in(admin, cat, ven, [(A, 2), (B, 2)], name="Z at both", selling_price=100)
    s = ok(admin.post("/api/sales", json={"payment_method": "UPI", "discount_type": "percent", "discount_value": 10,
                                          "items": [{"product_id": x["id"], "quantity": 1}, {"product_id": y["id"], "quantity": 2},
                                                    {"product_id": z["id"], "quantity": 3}]}))
    assert (s["subtotal"], s["discount_amount"], s["total"]) == (2300, 230, 2070)
    assert by_name(admin, x) == {"Nandyal": 2} and by_name(admin, y) == {"Warehouse": 1} and by_name(admin, z) == {"Warehouse": 1}
    txns = sale_txns(ctx, s["id"], "SALE")
    assert sorted((t["sku"], t["location_name"], t["quantity"]) for t in txns) == sorted([
        (x["sku"], "Nandyal", -1), (y["sku"], "Warehouse", -2), (z["sku"], "Nandyal", -2), (z["sku"], "Warehouse", -1)])
    assert "location_id" not in s and "location_name" not in s
    pdf = admin.get(f"/api/sales/{s['id']}/invoice.pdf")
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-"


def test_sale_list_and_detail_show_no_bill_level_location(admin):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 2), (B, 2)])
    s = ok(sell(admin, p, 3))
    assert "location_id" not in ok(admin.get(f"/api/sales/{s['id']}")) and "location_name" not in ok(admin.get(f"/api/sales/{s['id']}"))
    row = ok(admin.get("/api/sales"))["items"][0]
    assert "location_id" not in row and "location_name" not in row


# ------------------------------------------------------------------ specific location = optional filter
def test_choosing_one_location_sells_only_from_that_location(admin):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5), (B, 3)])
    r = sell(admin, p, 4, location_id=B["id"])
    assert r.status_code == 409 and "3 available at Warehouse" in r.json()["detail"] and "5 more at other locations" in r.json()["detail"]
    s = ok(sell(admin, p, 3, location_id=B["id"]))
    assert by_name(admin, p) == {"Nandyal": 5}
    assert [a["location_name"] for a in s["items"][0]["allocations"]] == ["Warehouse"]
    assert sell(admin, p, 1, location_id="LOC-9999").status_code == 422


# ------------------------------------------------------------------ 6: cancel restores to the same locations
def test_cancelling_a_split_sale_restores_each_location(admin, ctx):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5), (B, 3)])
    s = ok(sell(admin, p, 6))                                        # Nandyal 5, Warehouse 1
    assert by_name(admin, p) == {"Warehouse": 2}
    # meanwhile the shop moves the remaining stock around - the cancel must still put pieces back where they came from
    ok(admin.post("/api/inventory/transfers", json={"from_location_id": B["id"], "to_location_id": A["id"], "items": [{"product_id": p["id"], "quantity": 2}]}))
    assert by_name(admin, p) == {"Nandyal": 2}
    ok(admin.post(f"/api/sales/{s['id']}/cancel", json={"reason": "customer returned everything"}))
    assert by_name(admin, p) == {"Nandyal": 7, "Warehouse": 1}       # +5 at Nandyal, +1 at Warehouse
    returns = sale_txns(ctx, s["id"], "SALE_RETURN")
    assert sorted((t["location_name"], t["quantity"]) for t in returns) == [("Nandyal", 5), ("Warehouse", 1)]
    prod = ok(admin.get(f"/api/products/{p['id']}"))
    assert prod["current_quantity"] == 8 and prod["sold_quantity"] == 0
    assert ctx.store.all("payments")[0]["status"] == "refunded"
    assert "SALE_CANCELLED" in [a["action"] for a in ctx.store.all("audit_logs")]
    assert ok(admin.get(f"/api/sales/{s['id']}"))["status"] == "cancelled"
    assert admin.post(f"/api/sales/{s['id']}/cancel", json={"reason": "again"}).status_code == 409
    assert ok(admin.get("/api/data/health"))["status"] in ("ok", "warning")


def test_older_single_location_bills_can_still_be_cancelled(admin, ctx):
    """Bills saved before multi-location selling stored one location on the bill and on each item."""
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5)])
    s = ok(sell(admin, p, 2))
    with ctx.store.transaction() as tx:                                # rewrite the bill into the OLD shape
        rec = tx.require("sales", s["id"])
        rec["location_id"], rec["location_name"] = A["id"], "Nandyal"
        for it in rec["items"]:
            it.pop("allocations")
            it["location_id"] = A["id"]
        tx.put("sales", rec)
    ok(admin.post(f"/api/sales/{s['id']}/cancel", json={"reason": "old style bill"}))
    assert by_name(admin, p) == {"Nandyal": 5}
    assert [t["location_name"] for t in sale_txns(ctx, s["id"], "SALE_RETURN")] == ["Nandyal"]


# ------------------------------------------------------------------ 7: permissions, audit, safe writing
def test_permissions_and_audit_are_unchanged(admin, make_staff, ctx):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5), (B, 5)])
    assert sell(make_staff([]), p, 1).status_code == 403                                   # no sales.create
    cashier = make_staff(["sales.create"])
    assert sell(cashier, p, 1, discount_type="percent", discount_value=5).status_code == 403   # no Give Discount
    s = ok(sell(cashier, p, 2))
    assert "unit_cost" not in s["items"][0]                                                # cost still hidden from cashiers
    assert cashier.post(f"/api/sales/{s['id']}/cancel", json={"reason": "abc"}).status_code == 403
    entry = [a for a in ctx.store.all("audit_logs") if a["action"] == "SALE_CREATED"][-1]
    assert s["invoice_number"] in entry["details"] and "stock taken from: Nandyal 2" in entry["details"]


def test_split_sale_is_all_or_nothing_if_saving_fails(admin, ctx, settings):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5), (B, 3)])
    revisions = {n: ctx.store.status()[n].revision for n in ("products", "sales", "payments", "inventory_transactions", "audit_logs")}
    n_txn = len(ctx.store.all("inventory_transactions"))

    def crash(stage, name):
        if name == "payments":
            raise OSError("disk full")

    ctx.store._fault_hook = crash
    with pytest.raises(Exception):
        sale_service.create_sale(ctx, ctx.store.all("users")[0], {"payment_method": "Cash", "items": [{"product_id": p["id"], "quantity": 6}]})
    ctx.store._fault_hook = None
    assert by_name(admin, p) == {"Nandyal": 5, "Warehouse": 3}                        # neither location was touched
    assert len(ctx.store.all("inventory_transactions")) == n_txn and ctx.store.all("sales") == []
    assert {n: ctx.store.status()[n].revision for n in revisions} == revisions
    assert not list(settings.data_dir.glob("*.pre-txn")) and not (settings.data_dir / ".txn_journal.json").exists()
    assert ok(sell(admin, p, 6))["total"] == 6 * 699                                  # and it works normally afterwards


# ------------------------------------------------------------------ exports and reports
def test_sales_export_shows_where_each_piece_came_from(admin):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5), (B, 3)])
    ok(sell(admin, p, 6))
    wb = load_workbook(io.BytesIO(admin.get("/api/export/sales").content))
    bills = [c.value for c in wb["Details"][1]]
    assert "Location" not in bills                                                    # no bill-level location column
    items_ws = wb[[n for n in wb.sheetnames if n.startswith("Bill items")][0]]
    header = [c.value for c in items_ws[1]]
    assert "Stock taken from" in header
    assert items_ws.cell(2, header.index("Stock taken from") + 1).value == "Nandyal x 5, Warehouse x 1"


def test_reports_and_dashboard_still_add_up_with_split_sales(admin):
    cat, ven, A, B = shop(admin)
    p = product_in(admin, cat, ven, [(A, 5), (B, 3)], selling_price=1000, purchase_rate=400)
    ok(sell(admin, p, 6))
    d = ok(admin.get("/api/dashboard"))
    assert d["today"]["net"] == 6000 and d["today"]["items"] == 6 and d["inventory"]["total_stock"] == 2
    assert d["profit"]["cogs"] == 2175                                   # 6 x average cost 362.50 = (5 x 400 + 3 x 300) / 8
    inv = ok(admin.get("/api/reports/inventory"))["sections"][0]["rows"][0]
    assert inv["stock"] == 2 and inv["location"] == "Warehouse (2)"
