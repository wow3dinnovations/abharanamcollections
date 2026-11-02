"""Inventory purchases (jewellery bought for resale).

IMPORTANT: a purchase is NOT a business expense.  It increases stock and is tracked here;
running costs (rent, bags, marketing...) live in the Expenses module.
"""
from __future__ import annotations

from app.core.context import AppContext
from app.core.errors import Conflict, ValidationFailed
from app.services import audit_service, inventory_service
from app.utils.dates import date_of, in_range, now_iso, parse_date, today_iso
from app.utils.money import D, dsum, f


def _avg_cost(current_qty: int, current_rate: float, add_qty: int, add_rate: float) -> float:
    """Weighted-average cost after adding stock."""
    if current_qty <= 0:
        return f(add_rate)
    return f((D(current_qty) * D(current_rate) + D(add_qty) * D(add_rate)) / D(current_qty + add_qty))


def record_opening_purchase(ctx: AppContext, tx, user: dict, product: dict, qty: int) -> dict:
    """A product added with a starting quantity is recorded as a purchase so reports stay consistent."""
    vendor = tx.get("vendors", product["vendor_id"]) if product.get("vendor_id") else None
    loc_id = product["purchase_location_id"]
    pid = tx.next_id("PUR", 6)
    total = f(D(product["purchase_rate"]) * qty)
    purchase = {
        "id": pid, "vendor_id": product.get("vendor_id", ""), "vendor_name": vendor["name"] if vendor else "",
        "location_id": loc_id, "purchase_date": product["purchase_date"], "invoice_number": product.get("purchase_invoice_no", ""),
        "notes": "Recorded automatically when the product was added.", "source": "product_entry",
        "items": [{"product_id": product["id"], "sku": product["sku"], "name": product["name"], "quantity": qty,
                   "rate": product["purchase_rate"], "total": total}],
        "total": total, "created_by": user["id"], "created_by_name": user["username"],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    tx.insert("purchases", purchase)
    inventory_service.change_stock(tx, product, loc_id, qty, "PURCHASE", user, "purchase", pid,
                                   "Opening stock (product added)")
    return purchase


def _validate_items(tx, items: list[dict]) -> list[dict]:
    if not items:
        raise ValidationFailed("Add at least one product to the purchase.")
    clean = []
    for i, it in enumerate(items, 1):
        p = tx.get("products", it.get("product_id") or "")
        if p is None or p["status"] == "deleted":
            raise ValidationFailed(f"Row {i}: product not found.")
        try:
            qty = float(it.get("quantity"))
            rate = float(it.get("rate"))
        except (TypeError, ValueError):
            raise ValidationFailed(f"Row {i}: quantity and rate must be numbers.")
        if qty != int(qty) or qty <= 0:
            raise ValidationFailed(f"Row {i}: quantity must be a whole number greater than zero.")
        if rate < 0:
            raise ValidationFailed(f"Row {i}: purchase rate cannot be negative.")
        clean.append({"product_id": p["id"], "sku": p["sku"], "name": p["name"], "quantity": int(qty),
                      "rate": f(rate), "total": f(D(rate) * int(qty))})
    return clean


def create(ctx: AppContext, user: dict, data: dict, source: str = "purchase") -> dict:
    with ctx.store.transaction() as tx:
        return create_in_tx(ctx, tx, user, data, source)


def create_in_tx(ctx: AppContext, tx, user: dict, data: dict, source: str = "purchase") -> dict:
    """Save a purchase inside an already-open transaction (so it can be part of a larger all-or-nothing save)."""
    loc = tx.get("locations", data.get("location_id") or "")
    if loc is None:
        raise ValidationFailed("Please choose the location where the stock is received.")
    if not loc.get("active", True):
        raise ValidationFailed("That location is inactive.")
    vendor = None
    if data.get("vendor_id"):
        vendor = tx.get("vendors", data["vendor_id"])
        if vendor is None:
            raise ValidationFailed("That vendor does not exist.")
    pdate = parse_date(data.get("purchase_date") or today_iso(), "Purchase date").isoformat()
    items = _validate_items(tx, data.get("items") or [])
    pid = tx.next_id("PUR", 6)
    for it in items:
        product = tx.require("products", it["product_id"], "Product")
        cur_qty = inventory_service.total_stock(product)
        product["purchase_rate"] = _avg_cost(cur_qty, product["purchase_rate"], it["quantity"], it["rate"])
        if not data.get("keep_last_rate"):
            product["last_purchase_rate"] = it["rate"]
        if data.get("vendor_id"):
            product["vendor_id"] = data["vendor_id"]
        inventory_service.change_stock(tx, product, loc["id"], it["quantity"], "PURCHASE", user, "purchase", pid,
                                       data.get("txn_remarks") or f"Purchase {data.get('invoice_number') or ''}".strip())
        tx.put("products", product)
    purchase = {
        "id": pid, "vendor_id": data.get("vendor_id") or "", "vendor_name": vendor["name"] if vendor else "",
        "location_id": loc["id"], "purchase_date": pdate, "invoice_number": (data.get("invoice_number") or "").strip(),
        "notes": (data.get("notes") or "").strip(), "source": source, "items": items,
        "total": f(dsum(i["total"] for i in items)), "created_by": user["id"], "created_by_name": user["username"],
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    tx.insert("purchases", purchase)
    audit_service.record(tx, user, "PURCHASE_ADDED", "purchase", pid,
                         f"{len(items)} item(s), {sum(i['quantity'] for i in items)} pieces, total {purchase['total']}")
    return purchase


def update(ctx: AppContext, user: dict, purchase_id: str, data: dict) -> dict:
    with ctx.store.transaction() as tx:
        old = tx.require("purchases", purchase_id, "Purchase")
        vendor = None
        vendor_id = data.get("vendor_id", old["vendor_id"]) or ""
        if vendor_id:
            vendor = tx.get("vendors", vendor_id)
            if vendor is None:
                raise ValidationFailed("That vendor does not exist.")
        new_items = _validate_items(tx, data["items"]) if "items" in data else old["items"]
        loc_id = old["location_id"]
        if data.get("location_id") and data["location_id"] != loc_id:
            raise ValidationFailed("The location of a saved purchase cannot be changed. Use Stock Transfer to move stock.")

        old_q: dict[str, int] = {}
        old_v: dict[str, D] = {}
        for it in old["items"]:
            old_q[it["product_id"]] = old_q.get(it["product_id"], 0) + it["quantity"]
            old_v[it["product_id"]] = old_v.get(it["product_id"], D(0)) + D(it["total"])
        new_q: dict[str, int] = {}
        new_v: dict[str, D] = {}
        for it in new_items:
            new_q[it["product_id"]] = new_q.get(it["product_id"], 0) + it["quantity"]
            new_v[it["product_id"]] = new_v.get(it["product_id"], D(0)) + D(it["total"])
        changes = []
        for pid in sorted(set(old_q) | set(new_q)):
            product = tx.require("products", pid, "Product")
            delta = new_q.get(pid, 0) - old_q.get(pid, 0)
            cur_qty = inventory_service.total_stock(product)
            # re-work the average cost: take out the old purchase value, put in the new one
            value = D(product["purchase_rate"]) * cur_qty - old_v.get(pid, D(0)) + new_v.get(pid, D(0))
            new_total_qty = cur_qty + delta
            if delta:
                inventory_service.change_stock(tx, product, loc_id, delta, "PURCHASE", user, "purchase", purchase_id,
                                               f"Purchase edited ({old_q.get(pid, 0)} -> {new_q.get(pid, 0)})")
                changes.append(f"{product['sku']} {delta:+d}")
            if new_total_qty > 0 and value >= 0:
                product["purchase_rate"] = f(value / new_total_qty)
            elif pid in new_q:
                product["purchase_rate"] = f(new_v[pid] / new_q[pid])
            if pid in new_q:
                product["last_purchase_rate"] = f(new_v[pid] / new_q[pid])
            tx.put("products", product)

        old.update({
            "vendor_id": vendor_id, "vendor_name": vendor["name"] if vendor else "",
            "purchase_date": parse_date(data.get("purchase_date") or old["purchase_date"], "Purchase date").isoformat(),
            "invoice_number": (data.get("invoice_number", old.get("invoice_number", "")) or "").strip(),
            "notes": (data.get("notes", old.get("notes", "")) or "").strip(),
            "items": new_items, "total": f(dsum(i["total"] for i in new_items)), "updated_at": now_iso(),
        })
        tx.put("purchases", old)
        audit_service.record(tx, user, "PURCHASE_EDITED", "purchase", purchase_id,
                             "Edited purchase" + (f"; stock changes: {', '.join(changes)}" if changes else ""))
    return old


def list_purchases(ctx: AppContext, *, q: str = "", vendor_id: str = "", location_id: str = "", start: str = "",
                   end: str = "") -> list[dict]:
    ql = q.strip().lower()
    out = []
    for p in reversed(ctx.store.all("purchases")):
        if vendor_id and p["vendor_id"] != vendor_id:
            continue
        if location_id and p["location_id"] != location_id:
            continue
        if (start or end) and not in_range(p["purchase_date"], start or None, end or None):
            continue
        if ql:
            blob = f"{p['id']} {p.get('invoice_number', '')} {p.get('vendor_name', '')} " + \
                   " ".join(f"{i['sku']} {i['name']}" for i in p["items"])
            if ql not in blob.lower():
                continue
        out.append(p)
    out.sort(key=lambda p: (p["purchase_date"], p["created_at"]), reverse=True)
    return out


def present(ctx: AppContext, p: dict) -> dict:
    out = dict(p)
    loc = ctx.store.get("locations", p["location_id"])
    out["location_name"] = loc["name"] if loc else p["location_id"]
    out["item_count"] = len(p["items"])
    out["total_quantity"] = sum(i["quantity"] for i in p["items"])
    return out
