"""Data Health check: looks for missing / damaged files and for records that do not make sense."""
from __future__ import annotations

import math
from datetime import datetime, timedelta

from app.core.context import AppContext
from app.utils.money import D, q

LIMIT = 15      # examples listed per problem


def _check(name: str, status: str, message: str, details: list[str] | None = None) -> dict:
    return {"name": name, "status": status, "message": message, "details": (details or [])[:LIMIT],
            "more": max(len(details or []) - LIMIT, 0)}


def _bad_num(v) -> bool:
    return not isinstance(v, (int, float)) or isinstance(v, bool) or math.isnan(v) or math.isinf(v)


def run(ctx: AppContext) -> dict:
    s = ctx.store
    checks: list[dict] = []

    # ---- 1. files
    status = s.status()
    bad, created, files_detail = [], [], []
    for name in s.specs:
        ok, why = s.raw_file_ok(name)
        st = status[name]
        files_detail.append(f"{name}.json - {st.records} record(s)" + ("" if ok else f" - PROBLEM: {why}"))
        if st.state == "corrupted" or not ok:
            bad.append(f"{name}.json appears to be corrupted. Please restore a backup.")
        elif st.state == "created":
            created.append(f"{name}.json was missing and a new empty file was created.")
    checks.append(_check("Data files are readable", "error" if bad else "ok",
                         "All data files are present and valid." if not bad else f"{len(bad)} file(s) are damaged.", bad or None))
    if created:
        checks.append(_check("Missing files", "warning", "Some files were missing and were re-created empty. "
                                                         "If you expected data in them, restore a backup.", created))
    if s.recovered_from_crash:
        checks.append(_check("Interrupted save", "warning", s.recovered_from_crash))

    if bad:   # cannot check content of unreadable files
        readable = {n for n in s.specs if status[n].state != "corrupted"}
    else:
        readable = set(s.specs)

    def rows(name: str) -> list[dict]:
        return s.all(name) if name in readable else []

    products, purchases, sales = rows("products"), rows("purchases"), rows("sales")
    cats = {c["id"] for c in rows("categories")}
    subs = {c["id"]: c for c in rows("subcategories")}
    vendors = {c["id"] for c in rows("vendors")}
    locs = {c["id"] for c in rows("locations")}
    prod_ids = {p["id"] for p in products}
    custs = {c["id"] for c in rows("customers")}
    sale_ids = {x["id"] for x in sales}
    exp_cats = {c["id"] for c in rows("expense_categories")}

    # ---- 2. duplicates
    if "products" in readable:
        dup_sku, dup_bar, cross = [], [], []
        sku_seen, bar_seen = {}, {}
        for p in products:
            if p["status"] == "deleted":
                continue
            k = p["sku"].upper()
            if k in sku_seen:
                dup_sku.append(f"SKU {p['sku']} is used by {sku_seen[k]} and {p['id']}")
            sku_seen[k] = p["id"]
            b = p["barcode"].upper()
            if b in bar_seen:
                dup_bar.append(f"Barcode {p['barcode']} is used by {bar_seen[b]} and {p['id']}")
            bar_seen[b] = p["id"]
        for p in products:
            if p["status"] != "deleted" and p["barcode"].upper() in sku_seen and sku_seen[p["barcode"].upper()] != p["id"]:
                cross.append(f"Barcode {p['barcode']} of {p['id']} equals the SKU of {sku_seen[p['barcode'].upper()]}")
        checks.append(_check("Duplicate product codes (SKU)", "error" if dup_sku else "ok", f"{len(dup_sku)} duplicate(s)." if dup_sku else "No duplicate SKUs.", dup_sku))
        checks.append(_check("Duplicate barcodes", "error" if dup_bar or cross else "ok",
                             f"{len(dup_bar) + len(cross)} problem(s)." if dup_bar or cross else "No duplicate barcodes.", dup_bar + cross))

    # ---- 3. references
    refs: list[str] = []
    for p in products:
        if p["category_id"] not in cats:
            refs.append(f"Product {p['sku']} uses a category that does not exist ({p['category_id']})")
        if p.get("subcategory_id") and p["subcategory_id"] not in subs:
            refs.append(f"Product {p['sku']} uses a sub-category that does not exist")
        if p.get("vendor_id") and p["vendor_id"] not in vendors:
            refs.append(f"Product {p['sku']} uses a vendor that does not exist ({p['vendor_id']})")
        for loc in p["stock"]:
            if loc not in locs:
                refs.append(f"Product {p['sku']} has stock in a location that does not exist ({loc})")
    for pu in purchases:
        if pu.get("vendor_id") and pu["vendor_id"] not in vendors:
            refs.append(f"Purchase {pu['id']} uses a vendor that does not exist")
        if pu["location_id"] not in locs:
            refs.append(f"Purchase {pu['id']} uses a location that does not exist")
        for it in pu["items"]:
            if it["product_id"] not in prod_ids:
                refs.append(f"Purchase {pu['id']} refers to a product that does not exist ({it['product_id']})")
    for sa in sales:
        if sa.get("customer_id") and sa["customer_id"] not in custs:
            refs.append(f"Sale {sa['invoice_number']} refers to a customer that does not exist")
        for it in sa["items"]:
            if it["product_id"] not in prod_ids:
                refs.append(f"Sale {sa['invoice_number']} refers to a product that does not exist ({it['product_id']})")
    for e in rows("expenses"):
        if e["category_id"] not in exp_cats:
            refs.append(f"Expense {e['id']} uses an expense category that does not exist")
    for t in rows("inventory_transactions"):
        if t["product_id"] not in prod_ids:
            refs.append(f"Stock movement {t['id']} refers to a product that does not exist")
        if t["location_id"] not in locs:
            refs.append(f"Stock movement {t['id']} refers to a location that does not exist")
    for pay in rows("payments"):
        if pay["sale_id"] not in sale_ids:
            refs.append(f"Payment {pay['id']} refers to a sale that does not exist")
    for tr in rows("stock_transfers"):
        if tr["from_location_id"] not in locs or tr["to_location_id"] not in locs:
            refs.append(f"Transfer {tr['id']} refers to a location that does not exist")
    checks.append(_check("Links between records", "error" if refs else "ok", f"{len(refs)} broken link(s)." if refs else "Every record points to something that exists.", refs))

    # ---- 4/5. quantities and prices
    qty_bad, price_bad = [], []
    for p in products:
        for loc, qn in p["stock"].items():
            if _bad_num(qn) or qn < 0 or int(qn) != qn:
                qty_bad.append(f"Product {p['sku']} has an invalid stock quantity ({qn}) at {loc}")
        if p["sold_quantity"] < 0 or p["initial_quantity"] < 0:
            qty_bad.append(f"Product {p['sku']} has a negative initial/sold quantity")
        for field in ("purchase_rate", "selling_price"):
            v = p.get(field)
            if _bad_num(v) or v < 0:
                price_bad.append(f"Product {p['sku']} has an invalid {field.replace('_', ' ')} ({v})")
        if p.get("min_selling_price") is not None and p["min_selling_price"] > p["selling_price"]:
            price_bad.append(f"Product {p['sku']} has a minimum price above its selling price")
    for pu in purchases:
        for it in pu["items"]:
            if it["quantity"] <= 0:
                qty_bad.append(f"Purchase {pu['id']} has a quantity of {it['quantity']}")
            if _bad_num(it["rate"]) or it["rate"] < 0:
                price_bad.append(f"Purchase {pu['id']} has an invalid rate ({it['rate']})")
    for sa in sales:
        for it in sa["items"]:
            if it["quantity"] <= 0:
                qty_bad.append(f"Sale {sa['invoice_number']} has a quantity of {it['quantity']}")
            if _bad_num(it["unit_price"]) or it["unit_price"] < 0:
                price_bad.append(f"Sale {sa['invoice_number']} has an invalid price")
    for e in rows("expenses"):
        if _bad_num(e["amount"]) or e["amount"] <= 0:
            price_bad.append(f"Expense {e['id']} has an invalid amount ({e['amount']})")
    checks.append(_check("Quantities", "error" if qty_bad else "ok", f"{len(qty_bad)} problem(s)." if qty_bad else "All quantities are valid.", qty_bad))
    checks.append(_check("Prices and amounts", "error" if price_bad else "ok", f"{len(price_bad)} problem(s)." if price_bad else "All prices and amounts are valid.", price_bad))

    # ---- 6. stock ledger agrees with stock
    if "inventory_transactions" in readable and "products" in readable:
        ledger: dict[tuple, int] = {}
        for t in s.all("inventory_transactions"):
            ledger[(t["product_id"], t["location_id"])] = ledger.get((t["product_id"], t["location_id"]), 0) + t["quantity"]
        mism = []
        ledger_locs: dict[str, set[str]] = {}
        for (pid, l) in ledger:
            ledger_locs.setdefault(pid, set()).add(l)
        for p in products:
            for loc in set(p["stock"]) | ledger_locs.get(p["id"], set()):
                have, want = p["stock"].get(loc, 0), ledger.get((p["id"], loc), 0)
                if have != want:
                    mism.append(f"Product {p['sku']} at {loc}: stock shows {have} but the history adds up to {want}")
        checks.append(_check("Stock matches stock history", "error" if mism else "ok",
                             f"{len(mism)} mismatch(es)." if mism else "Every product's stock equals the total of its stock movements.", mism))

    # ---- 7. sales arithmetic
    arith = []
    for sa in sales:
        try:
            items_total = sum(D(i["line_total"]) for i in sa["items"])
            net = D(sa["subtotal"]) - D(sa["discount_amount"])
            if q(items_total) != q(net):
                arith.append(f"Sale {sa['invoice_number']}: item amounts do not add up to the bill")
            if sa["status"] == "completed" and q(sum(D(p["amount"]) for p in sa["payments"])) != q(D(sa["total"])):
                arith.append(f"Sale {sa['invoice_number']}: payments do not add up to the bill total")
        except Exception:
            arith.append(f"Sale {sa.get('invoice_number', '?')} could not be checked")
    if "sales" in readable:
        checks.append(_check("Bill totals", "warning" if arith else "ok", f"{len(arith)} bill(s) need a look." if arith else "All bill totals and payments add up.", arith))

    # ---- 8. users and backups
    if "users" in readable:
        admins = [u for u in rows("users") if u["role"] == "admin" and u.get("active", True)]
        checks.append(_check("Administrator account", "ok" if admins else "error", "At least one active Admin exists." if admins else "There is no active Admin account!"))
    last = ctx.backups.last()
    if last is None:
        checks.append(_check("Backups", "warning", "No backup has been made yet. Use Backup Now."))
    else:
        age = datetime.now() - datetime.fromisoformat(last["created_at"])
        if age > timedelta(days=7):
            checks.append(_check("Backups", "warning", f"The last backup is {age.days} days old. Please make a new backup."))
        else:
            checks.append(_check("Backups", "ok", f"Last backup: {last['created_at'].replace('T', ' ')} ({ctx.backups.count()} kept)."))

    worst = "error" if any(c["status"] == "error" for c in checks) else "warning" if any(c["status"] == "warning" for c in checks) else "ok"
    return {"status": worst, "checked_at": datetime.now().isoformat(timespec="seconds"), "checks": checks, "files": files_detail}
