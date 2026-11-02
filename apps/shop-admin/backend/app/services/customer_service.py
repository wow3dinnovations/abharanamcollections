"""Customers (optional on a bill - walk-in customers need no record)."""
from __future__ import annotations

import re

from app.core.context import AppContext
from app.core.errors import Conflict, ValidationFailed
from app.services import audit_service
from app.utils.dates import now_iso

FIELDS = {"name": 120, "mobile": 20, "email": 120, "address": 300, "notes": 500}


def clean(data: dict, partial: bool = False) -> dict:
    out = {}
    for f, maxlen in FIELDS.items():
        if f not in data:
            continue
        v = str(data[f] or "").strip()
        if len(v) > maxlen:
            raise ValidationFailed(f"{f.capitalize()} is too long.")
        out[f] = v
    if not partial and not out.get("name"):
        raise ValidationFailed("Customer name is required.")
    if "name" in out and not out["name"]:
        raise ValidationFailed("Customer name is required.")
    if out.get("mobile"):
        digits = re.sub(r"[\s\-+()]", "", out["mobile"])
        if not digits.isdigit() or not (7 <= len(digits) <= 15):
            raise ValidationFailed("Mobile number does not look valid.")
        out["mobile"] = digits
    if out.get("email") and "@" not in out["email"]:
        raise ValidationFailed("Email does not look valid.")
    return out


def _dup_mobile(tx, mobile: str, exclude: str | None) -> None:
    if not mobile:
        return
    for c in tx.iter_all("customers"):
        if c["id"] != exclude and c.get("mobile") == mobile:
            raise Conflict(f"A customer with mobile {mobile} already exists ({c['name']}).")


def create(ctx: AppContext, user: dict | None, data: dict, tx=None) -> dict:
    """Create a customer.  Pass ``tx`` to do it inside a larger transaction (e.g. a sale)."""
    c = clean(data)

    def work(t):
        _dup_mobile(t, c.get("mobile", ""), None)
        rec = {"id": t.next_id("CUS", 6), "name": c["name"], "mobile": c.get("mobile", ""), "email": c.get("email", ""),
               "address": c.get("address", ""), "notes": c.get("notes", ""), "active": True,
               "created_at": now_iso(), "created_by": (user or {}).get("id", "")}
        t.insert("customers", rec)
        audit_service.record(t, user, "MASTER_CHANGED", "customers", rec["id"], f"Added customer '{rec['name']}'")
        return rec

    if tx is not None:
        return work(tx)
    with ctx.store.transaction() as t:
        return work(t)


def update(ctx: AppContext, user: dict, cid: str, data: dict) -> dict:
    c = clean(data, partial=True)
    with ctx.store.transaction() as tx:
        rec = tx.require("customers", cid, "Customer")
        _dup_mobile(tx, c.get("mobile", ""), cid)
        rec.update(c)
        if "active" in data and data["active"] is not None:
            rec["active"] = bool(data["active"])
        rec["updated_at"] = now_iso()
        tx.put("customers", rec)
        audit_service.record(tx, user, "MASTER_CHANGED", "customers", cid, f"Edited customer '{rec['name']}'")
    return rec


def search(ctx: AppContext, q: str = "", active_only: bool = False) -> list[dict]:
    ql = q.strip().lower()
    out = []
    for c in ctx.store.all("customers"):
        if active_only and not c.get("active", True):
            continue
        if ql and ql not in f"{c['name']} {c.get('mobile', '')} {c.get('email', '')}".lower():
            continue
        out.append(c)
    return sorted(out, key=lambda c: c["name"].lower())


def with_stats(ctx: AppContext, customers: list[dict]) -> list[dict]:
    """Add bill count and total spent (completed sales only)."""
    stats: dict[str, list] = {}
    for s in ctx.store.all("sales"):
        if s["status"] == "completed" and s.get("customer_id"):
            st = stats.setdefault(s["customer_id"], [0, 0.0, ""])
            st[0] += 1
            st[1] += s["total"]
            st[2] = max(st[2], s["date_time"])
    return [{**c, "bill_count": stats.get(c["id"], [0, 0, ""])[0], "total_spent": round(stats.get(c["id"], [0, 0, ""])[1], 2),
             "last_purchase": stats.get(c["id"], [0, 0, ""])[2]} for c in customers]
