"""Demo data: realistic sample products, purchases, sales and expenses so you can try the software.

Every demo record is tagged  "is_demo": true  so it can be told apart from real data and removed again.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from app.core.context import AppContext
from app.core.errors import Conflict, ValidationFailed
from app.services import audit_service, expense_service, master_service, product_service, purchase_service, sale_service
from app.utils.dates import now_iso

DEMO_COLLECTIONS = ["products", "purchases", "sales", "payments", "expenses", "customers", "inventory_transactions",
                    "categories", "vendors", "locations", "stock_transfers"]

CATEGORIES = [("Earrings", "EAR"), ("Jhumkas", "JHM"), ("Chains", "CHA"), ("Bangles", "BAN"), ("Rings", "RIN")]
PRODUCTS = [  # name, category, cost, price, qty
    ("Gold Finish Jhumka", "JHM", 300, 799, 20), ("Antique Kundan Jhumka", "JHM", 420, 1099, 12), ("Pearl Drop Earrings", "EAR", 120, 349, 30),
    ("Temple Design Studs", "EAR", 90, 279, 25), ("Long Layered Chain", "CHA", 450, 1199, 10), ("Rope Pattern Chain", "CHA", 260, 699, 15),
    ("Bridal Gold Bangle Set", "BAN", 700, 1799, 8), ("Daily Wear Bangles (Pair)", "BAN", 150, 449, 24), ("Stone Studded Ring", "RIN", 100, 299, 18),
    ("Adjustable Kundan Ring", "RIN", 130, 379, 14),
]
SALES = [  # days ago, [(product index, qty)], discount %, method, customer
    (9, [(0, 2), (2, 1)], 10, "UPI", None), (8, [(4, 1)], 0, "Cash", None), (7, [(6, 1), (8, 2)], 5, "Card", ("Lakshmi Devi", "9000000011")),
    (5, [(1, 1), (3, 2)], 0, "UPI", None), (4, [(5, 2)], 10, "Cash", None), (3, [(7, 2), (9, 1)], 0, "UPI", ("Ravi Kumar", "9000000012")),
    (2, [(0, 1), (2, 3)], 0, "Cash", None), (1, [(6, 1)], 0, "UPI", None), (0, [(2, 2), (4, 1)], 10, "UPI", None), (0, [(3, 1)], 0, "Cash", None),
]
EXPENSES = [(20, "Shop Rent", "Monthly shop rent", 10000, "Landlord", "Bank Transfer"), (12, "Electricity", "Electricity bill", 2000, "Electricity Board", "UPI"),
            (6, "Marketing", "Instagram promotion", 1000, "Meta Ads", "UPI"), (3, "Packaging", "Shopping bags", 1500, "ABC Packaging", "UPI"),
            (0, "Packaging", "Shopping covers", 2500, "ABC Packaging", "UPI")]


def _ids(ctx: AppContext) -> dict[str, set[str]]:
    return {c: {r["id"] for r in ctx.store.all(c)} for c in DEMO_COLLECTIONS}


def _system_user(user: dict) -> dict:
    return user


def load(ctx: AppContext, user: dict) -> dict:
    if ctx.store.doc("settings").get("demo_data_loaded"):
        raise Conflict("Demo data is already loaded. Remove it first if you want to reset it.")
    before = _ids(ctx)
    ctx.backups.create("pre-demo", "Automatic backup before loading demo data", user.get("username", ""))

    cat_by_code, ven, loc = {}, None, None
    existing_cats = {c["code"]: c for c in ctx.store.all("categories")}
    for name, code in CATEGORIES:
        cat_by_code[code] = existing_cats.get(code) or master_service.create(ctx, user, "categories", {"name": name, "code": code})
    ven = next((v for v in ctx.store.all("vendors") if v["name"] == "Test Vendor"), None) or master_service.create(ctx, user, "vendors", {"name": "Test Vendor"})
    loc = next((l for l in ctx.store.all("locations") if l["name"] == "Nandyal"), None) or master_service.create(ctx, user, "locations", {"name": "Nandyal"})

    products = []
    for name, code, cost, price, qty in PRODUCTS:
        products.append(product_service.create_product(ctx, user, {
            "name": name, "category_id": cat_by_code[code]["id"], "vendor_id": ven["id"], "purchase_location_id": loc["id"],
            "purchase_rate": cost, "selling_price": price, "initial_quantity": qty, "collection": "Demo", "tags": "demo"}))
    sale_ids = []
    for days, lines, disc, method, cust in SALES:
        sale = sale_service.create_sale(ctx, user, {
            "items": [{"product_id": products[i]["id"], "quantity": q} for i, q in lines],
            "discount_type": "percent" if disc else None, "discount_value": disc, "payment_method": method,
            "customer": {"name": cust[0], "mobile": cust[1]} if cust else None})
        sale_ids.append((sale["id"], days))
    expense_ids = []
    for days, cat_name, desc, amount, payee, method in EXPENSES:
        cat = next(c for c in ctx.store.all("expense_categories") if c["name"] == cat_name)
        e = expense_service.create(ctx, user, {"expense_date": (date.today() - timedelta(days=days)).isoformat(), "category_id": cat["id"],
                                               "description": desc, "amount": amount, "payee": payee, "payment_method": method})
        expense_ids.append(e["id"])

    after = _ids(ctx)
    new = {c: after[c] - before[c] for c in DEMO_COLLECTIONS}
    when = {sid: days for sid, days in sale_ids}
    with ctx.store.transaction() as tx:
        for coll, ids in new.items():
            for rid in ids:
                rec = tx.require(coll, rid)
                rec["is_demo"] = True
                if coll == "sales" and rid in when:                      # spread the demo sales over the last days
                    stamp = (datetime.now() - timedelta(days=when[rid])).replace(microsecond=0).isoformat(timespec="seconds")
                    rec["date_time"] = stamp
                tx.put(coll, rec)
        for pay in [p for p in tx.iter_all("payments") if p["sale_id"] in when]:
            rec = dict(pay)
            rec["date_time"] = tx.require("sales", pay["sale_id"])["date_time"]
            tx.put("payments", rec)
        for t in [t for t in tx.iter_all("inventory_transactions") if t.get("reference_type") == "sale" and t.get("reference_id") in when]:
            rec = dict(t)
            rec["date_time"] = tx.require("sales", t["reference_id"])["date_time"]
            tx.put("inventory_transactions", rec)
        tx.doc("settings")["demo_data_loaded"] = True
        audit_service.record(tx, user, "DEMO_DATA", "demo", "load", f"Loaded demo data: {len(new['products'])} products, {len(new['sales'])} sales, {len(new['expenses'])} expenses")
    return {"products": len(new["products"]), "sales": len(new["sales"]), "expenses": len(new["expenses"]), "purchases": len(new["purchases"])}


def remove(ctx: AppContext, user: dict) -> dict:
    """Delete every demo record.  Real records are never touched; if a real record depends on a demo record, nothing is removed."""
    s = ctx.store
    demo_products = {p["id"] for p in s.all("products") if p.get("is_demo")}
    real_sales = [x for x in s.all("sales") if not x.get("is_demo") and any(i["product_id"] in demo_products for i in x["items"])]
    real_purchases = [x for x in s.all("purchases") if not x.get("is_demo") and any(i["product_id"] in demo_products for i in x["items"])]
    real_txns = [t for t in s.all("inventory_transactions") if not t.get("is_demo") and t["product_id"] in demo_products]
    if real_sales or real_purchases or real_txns:
        raise Conflict("Some of your real records use demo products, so the demo data cannot be removed automatically. "
                       "Cancel/adjust those first, or keep the demo products.")
    ctx.backups.create("pre-demo", "Automatic backup before removing demo data", user.get("username", ""))
    counts = {}
    with ctx.store.transaction() as tx:
        used_cats = {p["category_id"] for p in tx.iter_all("products") if not p.get("is_demo")}
        used_vendors = {p.get("vendor_id") for p in tx.iter_all("products") if not p.get("is_demo")} | {x.get("vendor_id") for x in tx.iter_all("purchases") if not x.get("is_demo")}
        used_locs = {l for p in tx.iter_all("products") if not p.get("is_demo") for l in p["stock"]} | {x["location_id"] for x in tx.iter_all("purchases") if not x.get("is_demo")}
        for coll in ("inventory_transactions", "payments", "sales", "purchases", "stock_transfers", "expenses", "customers", "products"):
            n = 0
            for rec in list(tx.iter_all(coll)):
                if rec.get("is_demo"):
                    tx.delete(coll, rec["id"])
                    n += 1
            counts[coll] = n
        for coll, used in (("categories", used_cats), ("vendors", used_vendors), ("locations", used_locs)):
            n = 0
            for rec in list(tx.iter_all(coll)):
                if rec.get("is_demo") and rec["id"] not in used:
                    tx.delete(coll, rec["id"])
                    n += 1
            counts[coll] = n
        tx.doc("settings")["demo_data_loaded"] = False
        audit_service.record(tx, user, "DEMO_DATA", "demo", "remove", f"Removed demo data: {counts}")
    return counts


def status(ctx: AppContext) -> dict:
    s = ctx.store
    return {"loaded": bool(s.doc("settings").get("demo_data_loaded")),
            "products": sum(1 for p in s.all("products") if p.get("is_demo")),
            "sales": sum(1 for x in s.all("sales") if x.get("is_demo")),
            "expenses": sum(1 for x in s.all("expenses") if x.get("is_demo"))}


__all__ = ["load", "remove", "status", "now_iso", "ValidationFailed"]
