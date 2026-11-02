"""POS sales: billing, discounts, payments, stock reduction, cancellation.

A sale changes several files (sales, payments, products, inventory transactions, customers, audit log,
counters).  It runs as ONE storage transaction - either everything is saved, or nothing is.
"""
from __future__ import annotations

from decimal import Decimal

from app.core.context import AppContext
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.services import audit_service, customer_service, inventory_service, settings_service
from app.utils.dates import date_of, in_range, now_iso, today_iso
from app.utils.money import D, dsum, f, q

WALK_IN = "Walk-in Customer"


# ------------------------------------------------------------------ calculations
def allocate(total: Decimal, grosses: list[Decimal]) -> list[Decimal]:
    """Split a bill discount over the lines in proportion to their value (last line takes the rounding rest)."""
    subtotal = dsum(grosses)
    if total <= 0 or subtotal <= 0:
        return [Decimal("0")] * len(grosses)
    out, running = [], Decimal("0")
    for i, g in enumerate(grosses):
        share = total - running if i == len(grosses) - 1 else q(total * g / subtotal)
        share = min(share, g)
        out.append(share)
        running += share
    return out


def compute_discount(subtotal: Decimal, dtype: str | None, value) -> Decimal:
    if not dtype or D(value) == 0:
        return Decimal("0")
    if dtype not in ("percent", "amount"):
        raise ValidationFailed("Discount type must be percent or amount.")
    try:
        v = D(value)
    except Exception:
        raise ValidationFailed("Discount must be a number.")
    if v < 0:
        raise ValidationFailed("Discount cannot be negative.")
    if dtype == "percent":
        if v > 100:
            raise ValidationFailed("Discount cannot be more than 100%.")
        amount = q(subtotal * v / 100)
    else:
        amount = q(v)
    if amount > subtotal:
        raise ValidationFailed(f"Discount (₹{amount}) cannot be more than the bill amount (₹{subtotal}).")
    return amount


def compute_tax(cfg: dict, net: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    """Returns (tax_amount, total_payable, taxable_value)."""
    b = cfg["billing"]
    rate = D(b.get("tax_rate", 0))
    if not b.get("tax_enabled") or rate <= 0:
        return Decimal("0"), net, net
    if b.get("tax_mode") == "inclusive":
        tax = q(net * rate / (100 + rate))
        return tax, net, net - tax
    tax = q(net * rate / 100)
    return tax, net + tax, net


def check_discount_allowed(ctx: AppContext, user: dict, discount: Decimal, subtotal: Decimal) -> None:
    if discount <= 0 or user["role"] == "admin":
        return
    cfg = settings_service.get(ctx)["billing"]
    if "sales.discount" not in user.get("permissions", []) or not cfg.get("staff_can_discount", True):
        raise Forbidden("You are not allowed to give discounts. Please ask the administrator.")
    max_pct = user.get("max_discount_percent")
    if max_pct is None:
        max_pct = cfg.get("staff_max_discount_percent")
    max_amt = user.get("max_discount_amount")
    if max_amt is None:
        max_amt = cfg.get("staff_max_discount_amount")
    if max_pct is not None and subtotal > 0 and discount * 100 > D(max_pct) * subtotal:
        raise Forbidden(f"Your maximum discount is {max_pct}% of the bill. Ask the administrator for larger discounts.")
    if max_amt is not None and discount > D(max_amt):
        raise Forbidden(f"Your maximum discount is ₹{max_amt} per bill. Ask the administrator for larger discounts.")


# ------------------------------------------------------------------ which location(s) does the stock come from?
def plan_allocation(stock: dict[str, int], qty: int, names: dict[str, str]) -> list[tuple[str, int]]:
    """Take from the location holding the MOST stock first, then the next, until ``qty`` is covered.

    Equal stock -> alphabetical by location name (so the result is always the same).
    ``stock`` = {location_id: pieces} (only the locations we may use).  Raises ValueError if it cannot be covered.
    """
    order = sorted(((lid, int(q)) for lid, q in stock.items() if int(q) > 0),
                   key=lambda kv: (-kv[1], names.get(kv[0], kv[0]).lower(), kv[0]))
    plan: list[tuple[str, int]] = []
    need = qty
    for lid, have in order:
        if need <= 0:
            break
        take = min(have, need)
        plan.append((lid, take))
        need -= take
    if need > 0:
        raise ValueError("not enough stock")
    return plan


def describe_stock(stock: dict[str, int], names: dict[str, str]) -> str:
    rows = sorted(((names.get(l, l), int(q)) for l, q in stock.items() if int(q) > 0), key=lambda r: (-r[1], r[0].lower()))
    return ", ".join(f"{n} {q}" for n, q in rows)


def item_allocations(sale: dict, item: dict) -> list[dict]:
    """Where a sold item came from.  Older bills (made before multi-location selling) only stored one location."""
    if item.get("allocations"):
        return item["allocations"]
    lid = item.get("location_id") or sale.get("location_id")
    return [{"location_id": lid, "location_name": item.get("location_name") or sale.get("location_name", ""), "quantity": item["quantity"]}] if lid else []


# ------------------------------------------------------------------ create
def create_sale(ctx: AppContext, user: dict, data: dict) -> dict:
    cfg = settings_service.get(ctx)
    raw_items = data.get("items") or []
    if not raw_items:
        raise ValidationFailed("The bill is empty. Scan or add at least one product.")
    merged: dict[str, int] = {}
    for it in raw_items:
        try:
            qty = float(it.get("quantity", 1))
        except (TypeError, ValueError):
            raise ValidationFailed("Quantity must be a number.")
        if qty != int(qty) or qty <= 0:
            raise ValidationFailed("Quantity must be a whole number greater than zero.")
        merged[it["product_id"]] = merged.get(it["product_id"], 0) + int(qty)

    with ctx.store.transaction() as tx:
        # A bill does not belong to a location.  "All locations" (blank) is the normal way; a specific location
        # may be chosen to sell ONLY from that place.
        loc_names = {l["id"]: l["name"] for l in tx.iter_all("locations")}
        only = None
        chosen = str(data.get("location_id") or "").strip()
        if chosen and chosen.upper() != "ALL":
            only = tx.get("locations", chosen)
            if only is None:
                raise ValidationFailed("That location does not exist.")
            if not only.get("active", True):
                raise ValidationFailed("That location is inactive.")

        # ---- products, stock and prices (server is the authority on price)
        products: dict[str, dict] = {}
        lines = []
        for pid, qty in merged.items():
            p = tx.get("products", pid)
            if p is None or p["status"] == "deleted":
                raise ValidationFailed("A product on the bill no longer exists.")
            if p["status"] != "active":
                raise Conflict(f"{p['name']} ({p['sku']}) is inactive and cannot be sold.")
            usable = {lid: int(n) for lid, n in p["stock"].items() if int(n) > 0 and (only is None or lid == only["id"])}
            available = sum(usable.values())
            if available < qty:
                where = f"at {only['name']}" if only else "in total across all locations"
                elsewhere = inventory_service.total_stock(p) - available
                spread = describe_stock(p["stock"], loc_names)
                hint = (f" ({elsewhere} more at other locations)" if only and elsewhere > 0 else
                        f" (stock: {spread})" if spread else "")
                raise Conflict(f"Not enough stock of {p['name']} ({p['sku']}): {available} available {where}, "
                               f"{qty} on the bill{hint}.")
            products[pid] = p
            gross = D(p["selling_price"]) * qty
            lines.append({"product": p, "qty": qty, "gross": gross, "plan": plan_allocation(usable, qty, loc_names)})

        subtotal = dsum(l["gross"] for l in lines)
        dtype = data.get("discount_type") or None
        dvalue = data.get("discount_value") or 0
        discount = compute_discount(subtotal, dtype, dvalue)
        check_discount_allowed(ctx, user, discount, subtotal)
        shares = allocate(discount, [l["gross"] for l in lines])
        for l, share in zip(lines, shares):
            p = l["product"]
            if share > 0:
                pct = share * 100 / l["gross"]
                allowed = p.get("discount_allowed_percent")
                if allowed is not None and pct > D(allowed) + Decimal("0.005"):
                    raise ValidationFailed(f"{p['name']} allows a maximum discount of {allowed}%.")
                mn = p.get("min_selling_price")
                if mn is not None and (l["gross"] - share) / l["qty"] < D(mn) - Decimal("0.005"):
                    raise ValidationFailed(f"This discount takes {p['name']} below its minimum selling price of ₹{mn}.")
            l["discount"] = share

        net = subtotal - discount
        tax, total, taxable = compute_tax(cfg, net)

        # ---- payments (split payments are supported by the data model)
        methods = cfg["billing"]["payment_methods"]
        pays_in = data.get("payments") or [{"method": data.get("payment_method") or cfg["billing"]["default_payment_method"],
                                             "amount": float(total)}]
        pays = []
        for pay in pays_in:
            amt = D(pay.get("amount", 0))
            if amt < 0:
                raise ValidationFailed("Payment amount cannot be negative.")
            if pay.get("method") not in methods:
                raise ValidationFailed(f"Payment method '{pay.get('method')}' is not available.")
            if amt > 0:
                pays.append({"method": pay["method"], "amount": f(amt), "reference": str(pay.get("reference") or "").strip()})
        if q(dsum(p["amount"] for p in pays)) != q(total):
            raise ValidationFailed(f"Payments (₹{q(dsum(p['amount'] for p in pays))}) must add up to the bill total (₹{q(total)}).")
        if total > 0 and not pays:
            raise ValidationFailed("Choose a payment method.")

        # ---- customer (optional)
        customer = None
        if data.get("customer_id"):
            customer = tx.get("customers", data["customer_id"])
            if customer is None:
                raise ValidationFailed("That customer does not exist.")
        elif data.get("customer") and (data["customer"].get("name") or data["customer"].get("mobile")):
            cdata = dict(data["customer"])
            cdata["name"] = cdata.get("name") or cdata.get("mobile")
            existing = None
            mobile = customer_service.clean(cdata).get("mobile", "")
            if mobile:
                existing = next((c for c in tx.iter_all("customers") if c.get("mobile") == mobile), None)
            customer = tx.get("customers", existing["id"]) if existing else customer_service.create(ctx, user, cdata, tx=tx)

        # ---- write everything
        sale_id = tx.next_id("SAL", 6)
        prefix = cfg["billing"]["invoice_prefix"]
        n = tx.next_number("invoice", start=int(cfg["billing"]["starting_invoice_number"]))
        invoice_no = f"{prefix}-{n:06d}" if prefix else f"{n:06d}"
        now = now_iso()
        items = []
        for l in lines:
            p = tx.require("products", l["product"]["id"])
            unit_cost = p["purchase_rate"]
            allocations = []
            for lid, take in l["plan"]:                              # one stock-history line per location touched
                inventory_service.change_stock(tx, p, lid, -take, "SALE", user, "sale", sale_id, f"Invoice {invoice_no}")
                allocations.append({"location_id": lid, "location_name": loc_names.get(lid, lid), "quantity": take})
            p["sold_quantity"] = int(p.get("sold_quantity", 0)) + l["qty"]
            tx.put("products", p)
            items.append({"product_id": p["id"], "sku": p["sku"], "name": p["name"], "category_id": p["category_id"],
                          "quantity": l["qty"], "unit_price": p["selling_price"], "gross": f(l["gross"]),
                          "discount_amount": f(l["discount"]), "line_total": f(l["gross"] - l["discount"]),
                          "unit_cost": unit_cost, "allocations": allocations})
        methods_used = sorted({p["method"] for p in pays})
        sale = {
            "id": sale_id, "invoice_number": invoice_no, "date_time": now, "customer_id": customer["id"] if customer else "",
            "customer_name": customer["name"] if customer else WALK_IN, "customer_mobile": customer.get("mobile", "") if customer else "",
            "cashier_id": user["id"], "cashier_name": user.get("full_name") or user["username"],
            "items": items,
            "item_count": sum(i["quantity"] for i in items), "subtotal": f(subtotal),
            "discount_type": dtype if discount > 0 else None, "discount_value": float(D(dvalue)) if discount > 0 else 0,
            "discount_amount": f(discount), "net_amount": f(net), "tax_amount": f(tax), "taxable_value": f(taxable),
            "tax_label": cfg["billing"]["tax_label"] if tax > 0 else "", "total": f(total),
            "payments": pays, "payment_method": methods_used[0] if len(methods_used) == 1 else ("Split" if methods_used else "None"),
            "status": "completed", "notes": str(data.get("notes") or "").strip()[:300],
        }
        tx.insert("sales", sale)
        for pay in pays:
            tx.insert("payments", {"id": tx.next_id("PAY", 6), "sale_id": sale_id, "invoice_number": invoice_no, "date_time": now,
                                   "method": pay["method"], "amount": pay["amount"], "reference": pay["reference"],
                                   "status": "received", "created_by": user["id"]})
        taken: dict[str, int] = {}
        for it in items:
            for a in it["allocations"]:
                taken[a["location_name"]] = taken.get(a["location_name"], 0) + a["quantity"]
        audit_service.record(tx, user, "SALE_CREATED", "sale", sale_id,
                             f"{invoice_no}: {sale['item_count']} pcs, total {sale['total']} ({sale['payment_method']}); "
                             f"stock taken from: {', '.join(f'{n} {q}' for n, q in sorted(taken.items()))}")
        if discount > 0:
            audit_service.record(tx, user, "DISCOUNT_APPLIED", "sale", sale_id,
                                 f"{invoice_no}: discount {sale['discount_amount']} ({dtype} {dvalue}) on {sale['subtotal']}")
    return sale


# ------------------------------------------------------------------ cancel
def cancel_sale(ctx: AppContext, user: dict, sale_id: str, reason: str) -> dict:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValidationFailed("Please write the reason for cancelling this sale.")
    with ctx.store.transaction() as tx:
        sale = tx.require("sales", sale_id, "Sale")
        if sale["status"] == "cancelled":
            raise Conflict("This sale is already cancelled.")
        for it in sale["items"]:
            p = tx.require("products", it["product_id"], "Product")
            for a in item_allocations(sale, it):
                inventory_service.change_stock(tx, p, a["location_id"], a["quantity"], "SALE_RETURN", user, "sale", sale_id,
                                               f"Cancelled {sale['invoice_number']}: {reason}")
            p["sold_quantity"] = max(int(p.get("sold_quantity", 0)) - it["quantity"], 0)
            tx.put("products", p)
        for pay in [p for p in tx.iter_all("payments") if p["sale_id"] == sale_id]:
            rec = dict(pay)
            rec["status"] = "refunded"
            rec["refunded_at"] = now_iso()
            tx.put("payments", rec)
        sale.update({"status": "cancelled", "cancelled_at": now_iso(), "cancelled_by": user["id"],
                     "cancelled_by_name": user.get("full_name") or user["username"], "cancel_reason": reason})
        tx.put("sales", sale)
        audit_service.record(tx, user, "SALE_CANCELLED", "sale", sale_id,
                             f"{sale['invoice_number']} cancelled ({sale['total']}): {reason}")
    return sale


# ------------------------------------------------------------------ queries
def search(ctx: AppContext, *, start: str = "", end: str = "", cashier_id: str = "", payment_method: str = "",
           customer: str = "", invoice: str = "", status: str = "") -> list[dict]:
    cq, iq = customer.strip().lower(), invoice.strip().lower()
    out = []
    for s in reversed(ctx.store.all("sales")):
        if status and s["status"] != status:
            continue
        if cashier_id and s["cashier_id"] != cashier_id:
            continue
        if (start or end) and not in_range(date_of(s["date_time"]), start or None, end or None):
            continue
        if payment_method and not any(p["method"] == payment_method for p in s["payments"]):
            continue
        if cq and cq not in f"{s['customer_name']} {s.get('customer_mobile', '')}".lower():
            continue
        if iq and iq not in s["invoice_number"].lower():
            continue
        out.append(s)
    return out


def get(ctx: AppContext, sale_id: str) -> dict:
    s = ctx.store.get("sales", sale_id)
    if s is None:
        raise NotFound("Sale not found.")
    return s


def can_view_invoice(user: dict, sale: dict) -> bool:
    if user["role"] == "admin" or "billing.reprint" in user.get("permissions", []):
        return True
    return "billing.generate" in user.get("permissions", []) and date_of(sale["date_time"]) == today_iso()
