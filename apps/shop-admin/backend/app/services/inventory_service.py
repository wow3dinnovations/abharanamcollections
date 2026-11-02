"""Stock movements.  EVERY change to stock goes through ``change_stock`` so it is always recorded."""
from __future__ import annotations

from app.core.context import AppContext
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.services import audit_service
from app.utils.dates import date_of, in_range, now_iso

TYPES = ["PURCHASE", "SALE", "SALE_RETURN", "STOCK_ADJUSTMENT", "STOCK_TRANSFER", "DAMAGE", "LOST", "OTHER",
         "SALE_CANCELLED"]


def total_stock(product: dict) -> int:
    return sum(int(q) for q in product.get("stock", {}).values())


def change_stock(tx, product: dict, location_id: str, delta: int, tx_type: str, user: dict | None,
                 ref_type: str = "", ref_id: str = "", remarks: str = "", extra: dict | None = None) -> dict:
    """Change stock of ``product`` (a working copy) at one location and record the movement.

    The caller must ``tx.put('products', product)`` afterwards.
    """
    if delta == 0:
        raise ValidationFailed("Quantity change cannot be zero.")
    if tx_type not in TYPES:
        raise ValidationFailed(f"Unknown stock movement type {tx_type}.")
    loc = tx.get("locations", location_id)
    if loc is None:
        raise ValidationFailed("That location does not exist.")
    stock = product.setdefault("stock", {})
    before = int(stock.get(location_id, 0))
    after = before + int(delta)
    if after < 0:
        raise Conflict(f"Not enough stock of {product['name']} ({product['sku']}) at {loc['name']}: "
                       f"{before} available, {abs(delta)} needed.")
    total_before = total_stock(product)
    if after == 0:
        stock.pop(location_id, None)
    else:
        stock[location_id] = after
    entry = {
        "id": tx.next_id("TXN", 7), "date_time": now_iso(), "product_id": product["id"], "sku": product["sku"],
        "product_name": product["name"], "location_id": location_id, "location_name": loc["name"],
        "type": tx_type, "quantity": int(delta), "previous_stock": before, "new_stock": after,
        "total_previous": total_before, "total_new": total_before + int(delta),
        "reference_type": ref_type, "reference_id": ref_id,
        "user_id": (user or {}).get("id", ""), "username": (user or {}).get("username", "system"), "remarks": remarks,
    }
    if extra:
        entry.update(extra)
    tx.insert("inventory_transactions", entry)
    product["updated_at"] = entry["date_time"]
    return entry


# ------------------------------------------------------------------ manual adjustments
def adjust(ctx: AppContext, user: dict, product_id: str, location_id: str, change: int, reason_type: str,
           remarks: str) -> dict:
    if reason_type not in ("STOCK_ADJUSTMENT", "DAMAGE", "LOST", "OTHER"):
        raise ValidationFailed("Reason must be Stock Adjustment, Damage, Lost or Other.")
    if not int(change):
        raise ValidationFailed("Enter how many pieces to add or remove.")
    if reason_type in ("DAMAGE", "LOST") and change > 0:
        raise ValidationFailed("Damaged or lost stock must be a reduction (negative number).")
    if not (remarks or "").strip():
        raise ValidationFailed("Please write a short reason (remarks) for this stock change.")
    with ctx.store.transaction() as tx:
        product = tx.require("products", product_id, "Product")
        if product.get("status") == "deleted":
            raise Conflict("This product has been deleted.")
        entry = change_stock(tx, product, location_id, int(change), reason_type, user, "adjustment", "", remarks.strip())
        tx.put("products", product)
        audit_service.record(tx, user, "INVENTORY_CHANGED", "product", product_id,
                             f"{reason_type}: {change:+d} at {entry['location_name']} ({entry['previous_stock']} -> {entry['new_stock']}). {remarks.strip()}")
    return entry


# ------------------------------------------------------------------ "Adjust Stock": set the correct (counted) quantity
ADJUST_REASONS = {"COUNT_CORRECTION": "Counting correction", "DAMAGE": "Damaged", "LOST": "Lost", "OTHER": "Other"}


def set_quantity(ctx: AppContext, user: dict, product_id: str, location_id: str, new_quantity: int, reason: str,
                 remarks: str = "") -> dict:
    """Make the stock of one product at one location equal ``new_quantity`` (e.g. after a physical count)."""
    if new_quantity < 0:
        raise ValidationFailed("The quantity cannot be negative.")
    if reason not in ADJUST_REASONS:
        raise ValidationFailed("Please choose a reason: counting correction, damaged, lost or other.")
    remarks = (remarks or "").strip()
    if reason == "OTHER" and not remarks:
        raise ValidationFailed("Please explain the reason in the remarks.")
    with ctx.store.transaction() as tx:
        product = tx.require("products", product_id, "Product")
        if product.get("status") == "deleted":
            raise Conflict("This product has been deleted.")
        loc = tx.get("locations", location_id or "")
        if loc is None:
            raise ValidationFailed("Please choose the location.")
        previous = int(product["stock"].get(location_id, 0))
        delta = new_quantity - previous
        if delta == 0:
            raise ValidationFailed(f"The quantity at {loc['name']} is already {previous}. There is nothing to change.")
        if reason in ("DAMAGE", "LOST") and delta > 0:
            raise ValidationFailed("Damaged or lost stock must lower the quantity.")
        if delta > 0 and not loc.get("active", True):
            raise ValidationFailed("That location is inactive, so stock cannot be added to it.")
        label = ADJUST_REASONS[reason]
        entry = change_stock(tx, product, location_id, delta, "STOCK_ADJUSTMENT", user, "adjustment", "",
                             label + (f" - {remarks}" if remarks else ""),
                             extra={"reason": reason, "reason_label": label, "counted_quantity": new_quantity})
        tx.put("products", product)
        audit_service.record(tx, user, "INVENTORY_CHANGED", "product", product_id,
                             f"Adjust Stock ({label}) at {loc['name']}: {previous} -> {new_quantity} ({delta:+d}) for {product['sku']}"
                             + (f". {remarks}" if remarks else ""))
    return entry


# ------------------------------------------------------------------ "Add Stock": increase by a number
ADD_KINDS = {"PURCHASE": "New stock bought (purchase)", "OTHER": "Other (found, returned, gift...)"}


def add_stock(ctx: AppContext, user: dict, product_id: str, location_id: str, quantity: int, kind: str = "PURCHASE",
              purchase_rate: float | None = None, vendor_id: str = "", remarks: str = "") -> dict:
    """Add pieces to a location.

    PURCHASE -> also saved as a purchase (so purchase reports, cost and vendor stay right); a blank rate keeps the current cost.
    OTHER    -> a plain stock increase (stock found, returned from elsewhere, a gift...); cost and purchases are not touched.
    """
    from app.services import purchase_service                    # (imported here: purchase_service uses this module too)
    if quantity <= 0:
        raise ValidationFailed("Enter how many pieces to add (1 or more).")
    if kind not in ADD_KINDS:
        raise ValidationFailed("Choose whether this is a purchase or something else.")
    remarks = (remarks or "").strip()
    if kind == "OTHER" and not remarks:
        raise ValidationFailed("Please write in the remarks where this stock came from (found, returned, gift...).")
    if purchase_rate is not None and purchase_rate < 0:
        raise ValidationFailed("Purchase rate cannot be negative.")
    with ctx.store.transaction() as tx:
        product = tx.require("products", product_id, "Product")
        if product.get("status") == "deleted":
            raise Conflict("This product has been deleted.")
        loc = tx.get("locations", location_id or "")
        if loc is None:
            raise ValidationFailed("Please choose the location.")
        if not loc.get("active", True):
            raise ValidationFailed("That location is inactive.")
        previous = int(product["stock"].get(location_id, 0))
        purchase_id = ""
        if kind == "PURCHASE":
            rate = product["purchase_rate"] if purchase_rate is None else purchase_rate
            purchase = purchase_service.create_in_tx(ctx, tx, user, {
                "vendor_id": vendor_id, "location_id": location_id, "notes": remarks or "Added with Add Stock",
                "items": [{"product_id": product_id, "quantity": quantity, "rate": rate}],
                "txn_remarks": "Add Stock" + (f": {remarks}" if remarks else ""), "keep_last_rate": purchase_rate is None,
            }, source="stock_add")
            purchase_id = purchase["id"]
        else:
            change_stock(tx, product, location_id, quantity, "OTHER", user, "adjustment", "", f"Add Stock (other): {remarks}")
            tx.put("products", product)
        detail = f"Add Stock ({'purchase' if kind == 'PURCHASE' else 'other'}) at {loc['name']}: {previous} -> {previous + quantity} (+{quantity}) for {product['sku']}"
        if kind == "PURCHASE":
            detail += f", rate {'kept' if purchase_rate is None else purchase_rate}, purchase {purchase_id}"
        audit_service.record(tx, user, "INVENTORY_CHANGED", "product", product_id, detail + (f". {remarks}" if remarks else ""))
    return {"kind": kind, "product_id": product_id, "location_id": location_id, "location_name": loc["name"], "quantity": quantity,
            "previous_stock": previous, "new_stock": previous + quantity, "purchase_id": purchase_id}


# ------------------------------------------------------------------ transfers between locations
def transfer(ctx: AppContext, user: dict, from_id: str, to_id: str, items: list[dict], remarks: str = "") -> dict:
    if from_id == to_id:
        raise ValidationFailed("Choose two different locations.")
    if not items:
        raise ValidationFailed("Add at least one product to transfer.")
    seen = set()
    with ctx.store.transaction() as tx:
        src, dst = tx.get("locations", from_id), tx.get("locations", to_id)
        if src is None or dst is None:
            raise ValidationFailed("Location not found.")
        if not dst.get("active", True):
            raise ValidationFailed("The destination location is inactive.")
        transfer_id = tx.next_id("TRF", 6)
        lines = []
        for it in items:
            qty = int(it["quantity"])
            pid = it["product_id"]
            if qty <= 0:
                raise ValidationFailed("Transfer quantity must be at least 1.")
            if pid in seen:
                raise ValidationFailed("The same product appears twice - combine the quantities.")
            seen.add(pid)
            product = tx.require("products", pid, "Product")
            change_stock(tx, product, from_id, -qty, "STOCK_TRANSFER", user, "transfer", transfer_id,
                         f"Transfer to {dst['name']}. {remarks}".strip())
            change_stock(tx, product, to_id, qty, "STOCK_TRANSFER", user, "transfer", transfer_id,
                         f"Transfer from {src['name']}. {remarks}".strip())
            tx.put("products", product)
            lines.append({"product_id": pid, "sku": product["sku"], "name": product["name"], "quantity": qty})
        rec = {"id": transfer_id, "date_time": now_iso(), "from_location_id": from_id, "from_location_name": src["name"],
               "to_location_id": to_id, "to_location_name": dst["name"], "items": lines, "remarks": remarks,
               "user_id": user["id"], "username": user["username"]}
        tx.insert("stock_transfers", rec)
        audit_service.record(tx, user, "STOCK_TRANSFER", "transfer", transfer_id,
                             f"{sum(l['quantity'] for l in lines)} pieces from {src['name']} to {dst['name']}")
    return rec


def list_transfers(ctx: AppContext, start: str | None, end: str | None) -> list[dict]:
    rows = [t for t in ctx.store.all("stock_transfers") if in_range(date_of(t["date_time"]), start, end)]
    return sorted(rows, key=lambda t: t["date_time"], reverse=True)


# ------------------------------------------------------------------ history
def list_transactions(ctx: AppContext, *, product_id: str | None = None, location_id: str | None = None,
                      tx_type: str | None = None, start: str | None = None, end: str | None = None,
                      q: str | None = None) -> list[dict]:
    rows = ctx.store.all("inventory_transactions")
    ql = (q or "").strip().lower()
    out = []
    for t in reversed(rows):                       # newest first
        if product_id and t["product_id"] != product_id:
            continue
        if location_id and t["location_id"] != location_id:
            continue
        if tx_type and t["type"] != tx_type:
            continue
        if (start or end) and not in_range(date_of(t["date_time"]), start, end):
            continue
        if ql and ql not in f"{t['sku']} {t['product_name']} {t.get('reference_id', '')} {t.get('remarks', '')}".lower():
            continue
        out.append(t)
    return out


def get_transaction(ctx: AppContext, tid: str) -> dict:
    t = ctx.store.get("inventory_transactions", tid)
    if t is None:
        raise NotFound("Inventory transaction not found.")
    return t
