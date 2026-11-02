"""POS sales, discounts, payments, invoices, cancellation (Phase 5)."""
from __future__ import annotations

import pytest

from tests.helpers import basic_setup, make_category, make_product, ok


def pos_setup(admin, qty=10, price=699, **over):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, name="Test Gold Jhumka", sku="ABH-JHM-TEST001", selling_price=price,
                     initial_quantity=qty, **over)
    return cat, ven, loc, p


def sell(c, loc, p, qty=1, **extra):
    body = {"location_id": loc["id"], "items": [{"product_id": p["id"], "quantity": qty}], "payment_method": "UPI", **extra}
    return c.post("/api/sales", json=body)


def stock(c, p):
    return ok(c.get(f"/api/products/{p['id']}"))["current_quantity"]


def test_sale_with_percentage_discount_matches_the_worked_example(admin, ctx):
    cat, ven, loc, p = pos_setup(admin)
    r = ok(sell(admin, loc, p, 2, discount_type="percent", discount_value=10))
    assert r["subtotal"] == 1398 and r["discount_amount"] == 139.80 and r["total"] == 1258.20
    assert r["invoice_number"] == "INV-000001" and r["status"] == "completed"
    assert r["items"][0]["quantity"] == 2 and r["items"][0]["unit_cost"] == 300
    assert stock(admin, p) == 8
    prod = ok(admin.get(f"/api/products/{p['id']}"))
    assert prod["sold_quantity"] == 2 and prod["initial_quantity"] == 10
    last = ctx.store.all("inventory_transactions")[-1]
    assert last["type"] == "SALE" and last["quantity"] == -2 and last["previous_stock"] == 10 and last["new_stock"] == 8
    assert last["reference_id"] == r["id"]
    actions = [a["action"] for a in ctx.store.all("audit_logs")]
    assert "SALE_CREATED" in actions and "DISCOUNT_APPLIED" in actions
    pays = ctx.store.all("payments")
    assert len(pays) == 1 and pays[0]["amount"] == 1258.20 and pays[0]["method"] == "UPI" and pays[0]["status"] == "received"


def test_two_products_ten_percent_example(admin):
    cat, ven, loc = basic_setup(admin)
    a = make_product(admin, cat, ven, loc, name="A", selling_price=799, initial_quantity=5)
    b = make_product(admin, cat, ven, loc, name="B", selling_price=998, initial_quantity=5)
    r = ok(admin.post("/api/sales", json={"location_id": loc["id"], "payment_method": "UPI", "discount_type": "percent",
                                          "discount_value": 10, "items": [{"product_id": a["id"], "quantity": 1}, {"product_id": b["id"], "quantity": 1}]}))
    assert (r["subtotal"], r["discount_amount"], r["total"]) == (1797, 179.70, 1617.30)
    assert round(sum(i["discount_amount"] for i in r["items"]), 2) == 179.70          # allocation adds up exactly
    assert round(sum(i["line_total"] for i in r["items"]), 2) == 1617.30


def test_fixed_amount_discount_and_limits(admin):
    cat, ven, loc, p = pos_setup(admin, price=1000)
    r = ok(sell(admin, loc, p, 2, discount_type="amount", discount_value=150))
    assert r["total"] == 1850 and r["discount_amount"] == 150
    assert sell(admin, loc, p, 1, discount_type="amount", discount_value=1500).status_code == 422        # more than the bill
    assert sell(admin, loc, p, 1, discount_type="percent", discount_value=101).status_code == 422
    assert sell(admin, loc, p, 1, discount_type="amount", discount_value=-5).status_code == 422
    assert stock(admin, p) == 8                                                                             # failed sales changed nothing
    r = ok(sell(admin, loc, p, 1, discount_type="percent", discount_value=100))                              # 100% is allowed -> free
    assert r["total"] == 0


def test_stock_checks_and_bad_quantities(admin):
    cat, ven, loc, p = pos_setup(admin, qty=3)
    r = sell(admin, loc, p, 5)
    assert r.status_code == 409 and "Not enough stock" in r.json()["detail"]
    for bad in (0, -2):
        assert sell(admin, loc, p, bad).status_code == 422
    assert admin.post("/api/sales", json={"location_id": loc["id"], "items": [], "payment_method": "Cash"}).status_code == 422
    assert admin.post("/api/sales", json={"location_id": "LOC-404", "items": [{"product_id": p["id"], "quantity": 1}], "payment_method": "Cash"}).status_code == 422
    assert stock(admin, p) == 3
    ok(sell(admin, loc, p, 3))
    assert sell(admin, loc, p, 1).status_code == 409                          # now out of stock


def test_stock_is_per_location(admin):
    cat, ven, loc, p = pos_setup(admin, qty=3)
    other = ok(admin.post("/api/locations", json={"name": "Warehouse"}))
    r = sell(admin, other, p, 1)
    assert r.status_code == 409


def test_payment_rules_split_and_unknown_methods(admin, ctx):
    cat, ven, loc, p = pos_setup(admin, price=1000)
    assert sell(admin, loc, p, 1, payment_method="Bitcoin").status_code == 422
    body = {"payments": [{"method": "Cash", "amount": 400}, {"method": "UPI", "amount": 500, "reference": "UPI123"}]}
    assert sell(admin, loc, p, 1, **body).status_code == 422                  # 900 != 1000
    r = ok(sell(admin, loc, p, 1, payments=[{"method": "Cash", "amount": 400}, {"method": "UPI", "amount": 600, "reference": "UPI123"}]))
    assert r["payment_method"] == "Split" and len(ctx.store.all("payments")) == 2


def test_invoice_number_increments_and_pdf_is_generated(admin, settings):
    cat, ven, loc, p = pos_setup(admin)
    a = ok(sell(admin, loc, p))
    b = ok(sell(admin, loc, p))
    assert (a["invoice_number"], b["invoice_number"]) == ("INV-000001", "INV-000002")
    pdf = admin.get(f"/api/sales/{a['id']}/invoice.pdf")
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-" and len(pdf.content) > 2000
    assert (settings.invoices_dir / "INV-000001.pdf").exists()
    assert ok(admin.post(f"/api/sales/{a['id']}/reprint"))["ok"] is True


def test_customer_optional_and_saved(admin):
    cat, ven, loc, p = pos_setup(admin)
    walk = ok(sell(admin, loc, p))
    assert walk["customer_name"] == "Walk-in Customer" and walk["customer_id"] == ""
    r = ok(sell(admin, loc, p, customer={"name": "Lakshmi", "mobile": "98765 43210"}))
    assert r["customer_name"] == "Lakshmi" and r["customer_id"].startswith("CUS-")
    again = ok(sell(admin, loc, p, customer={"name": "Someone Else", "mobile": "9876543210"}))
    assert again["customer_id"] == r["customer_id"]                          # same mobile -> same customer
    custs = ok(admin.get("/api/customers"))
    assert custs["total"] == 1 and custs["items"][0]["bill_count"] == 2


def test_cancel_sale_restores_everything(admin, ctx):
    cat, ven, loc, p = pos_setup(admin)
    sale = ok(sell(admin, loc, p, 2, discount_type="percent", discount_value=10))
    assert stock(admin, p) == 8
    assert admin.post(f"/api/sales/{sale['id']}/cancel", json={"reason": ""}).status_code == 422
    c = ok(admin.post(f"/api/sales/{sale['id']}/cancel", json={"reason": "Customer changed mind"}))
    assert c["status"] == "cancelled" and c["cancel_reason"] == "Customer changed mind"
    assert stock(admin, p) == 10
    assert ok(admin.get(f"/api/products/{p['id']}"))["sold_quantity"] == 0
    assert ctx.store.all("inventory_transactions")[-1]["type"] == "SALE_RETURN"
    assert ctx.store.all("inventory_transactions")[-1]["quantity"] == 2
    assert "SALE_CANCELLED" in [a["action"] for a in ctx.store.all("audit_logs")]
    assert ctx.store.all("payments")[0]["status"] == "refunded"
    assert admin.post(f"/api/sales/{sale['id']}/cancel", json={"reason": "again"}).status_code == 409
    assert ok(admin.get(f"/api/sales/{sale['id']}"))["status"] == "cancelled"             # never deleted
    pdf = admin.get(f"/api/sales/{sale['id']}/invoice.pdf")
    assert pdf.status_code == 200 and pdf.content[:5] == b"%PDF-"


def test_sales_history_filters(admin):
    cat, ven, loc, p = pos_setup(admin, qty=20)
    ok(sell(admin, loc, p, 1, payment_method="Cash"))
    s2 = ok(sell(admin, loc, p, 1, payment_method="UPI", customer={"name": "Ravi", "mobile": "9000000001"}))
    ok(admin.post(f"/api/sales/{s2['id']}/cancel", json={"reason": "wrong item"}))
    assert ok(admin.get("/api/sales"))["total"] == 2
    assert ok(admin.get("/api/sales?payment_method=UPI"))["total"] == 1
    assert ok(admin.get("/api/sales?status=cancelled"))["total"] == 1
    assert ok(admin.get("/api/sales?customer=ravi"))["total"] == 1
    assert ok(admin.get("/api/sales?invoice=000001"))["total"] == 1
    assert ok(admin.get("/api/sales?start=2999-01-01"))["total"] == 0
    assert ok(admin.get("/api/sales"))["items"][0]["invoice_number"] == "INV-000002"          # newest first


def test_tax_modes(admin):
    cat, ven, loc, p = pos_setup(admin, price=1000)
    ok(admin.put("/api/settings", json={"billing": {"tax_enabled": True, "tax_rate": 3, "tax_mode": "exclusive"}}))
    r = ok(sell(admin, loc, p, 1))
    assert (r["net_amount"], r["tax_amount"], r["total"], r["taxable_value"]) == (1000, 30, 1030, 1000)
    ok(admin.put("/api/settings", json={"billing": {"tax_mode": "inclusive"}}))
    r = ok(sell(admin, loc, p, 1))
    assert (r["total"], r["tax_amount"], r["taxable_value"]) == (1000, 29.13, 970.87)
    ok(admin.put("/api/settings", json={"billing": {"tax_enabled": False}}))
    r = ok(sell(admin, loc, p, 1))
    assert r["tax_amount"] == 0 and r["total"] == 1000


def test_product_discount_limits(admin):
    cat, ven, loc, p = pos_setup(admin, price=1000, discount_allowed_percent=5)
    assert sell(admin, loc, p, 1, discount_type="percent", discount_value=10).status_code == 422
    ok(sell(admin, loc, p, 1, discount_type="percent", discount_value=5))
    cat2 = make_category(admin, "Rings", "RIN")
    q = make_product(admin, cat2, ok(admin.get("/api/vendors"))["items"][0], loc, name="Min", selling_price=1000,
                     min_selling_price=900, initial_quantity=5)
    assert sell(admin, loc, q, 1, discount_type="amount", discount_value=150).status_code == 422
    ok(sell(admin, loc, q, 1, discount_type="amount", discount_value=100))


def test_staff_discount_permissions_and_caps(admin, make_staff):
    cat, ven, loc, p = pos_setup(admin, qty=30, price=1000)
    cashier = make_staff(["sales.create", "billing.generate", "inventory.view"])
    assert sell(cashier, loc, p, 1, discount_type="percent", discount_value=5).status_code == 403   # no 'Give Discount' permission
    ok(sell(cashier, loc, p, 1))                                                                     # normal sale is fine
    disc = make_staff(["sales.create", "sales.discount"])
    assert sell(disc, loc, p, 1, discount_type="percent", discount_value=20).status_code == 403     # default cap is 10%
    ok(sell(disc, loc, p, 1, discount_type="percent", discount_value=10))
    ok(admin.put(f"/api/users/{disc.user_id}", json={"max_discount_percent": 25}))
    disc.post("/api/auth/login", json={"username": "staff2", "password": "Staff@12345"})
    ok(sell(disc, loc, p, 1, discount_type="percent", discount_value=20))
    ok(admin.put("/api/settings", json={"billing": {"staff_can_discount": False}}))
    assert sell(disc, loc, p, 1, discount_type="percent", discount_value=5).status_code == 403
    ok(sell(admin, loc, p, 1, discount_type="percent", discount_value=50))                          # admin unrestricted


def test_sales_permissions(admin, make_staff):
    cat, ven, loc, p = pos_setup(admin)
    nobody = make_staff([])
    assert sell(nobody, loc, p).status_code == 403
    cashier = make_staff(["sales.create"])
    s = ok(sell(cashier, loc, p))
    assert "unit_cost" not in s["items"][0]                                    # cashiers never see cost
    assert cashier.get("/api/sales").status_code == 403
    assert cashier.post(f"/api/sales/{s['id']}/cancel", json={"reason": "abc"}).status_code == 403
    assert cashier.get(f"/api/sales/{s['id']}/invoice.pdf").status_code == 403       # needs a billing permission
    printer = make_staff(["sales.create", "billing.generate"])
    s2 = ok(sell(printer, loc, p))
    assert printer.get(f"/api/sales/{s2['id']}/invoice.pdf").status_code == 200       # a bill made today
    viewer = make_staff(["sales.view", "sales.cancel"])
    assert viewer.get("/api/sales").status_code == 200
    ok(viewer.post(f"/api/sales/{s2['id']}/cancel", json={"reason": "test"}))


def test_sale_is_all_or_nothing_if_saving_fails(admin, ctx, settings):
    cat, ven, loc, p = pos_setup(admin)
    names = ("products", "sales", "payments", "inventory_transactions", "audit_logs")
    before = {n: ctx.store.status()[n].revision for n in names}

    def crash(stage, name):
        if name == "sales":                      # dies part-way through swapping the files in
            raise OSError("disk full")

    ctx.store._fault_hook = crash
    from app.services import sale_service
    with pytest.raises(Exception):
        sale_service.create_sale(ctx, ctx.store.all("users")[0], {"location_id": loc["id"], "payment_method": "Cash",
                                                                   "items": [{"product_id": p["id"], "quantity": 2}]})
    ctx.store._fault_hook = None
    assert stock(admin, p) == 10
    assert ctx.store.all("sales") == [] and ctx.store.all("payments") == []
    assert {n: ctx.store.status()[n].revision for n in names} == before
    assert not list(settings.data_dir.glob("*.pre-txn")) and not (settings.data_dir / ".txn_journal.json").exists()
    ok(sell(admin, loc, p, 2))                                                # works normally afterwards
    assert stock(admin, p) == 8
