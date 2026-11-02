"""Business expenses (rent, bags, marketing...).  NOT the same as inventory purchases."""
from __future__ import annotations

import secrets
from pathlib import Path

from app.core.context import AppContext
from app.core.errors import Conflict, ValidationFailed
from app.services import audit_service, settings_service
from app.utils.dates import in_range, now_iso, parse_date, today_iso
from app.utils.money import D, f

RECEIPT_EXTS = {".pdf": b"%PDF", ".jpg": b"\xff\xd8\xff", ".jpeg": b"\xff\xd8\xff", ".png": b"\x89PNG"}
MAX_RECEIPT_BYTES = 8 * 1024 * 1024
MAX_AMOUNT = 100_000_000


def _clean(ctx: AppContext, tx, data: dict, partial: bool = False) -> dict:
    out: dict = {}
    if not partial or "expense_date" in data:
        d = parse_date(data.get("expense_date") or today_iso(), "Expense date")
        out["expense_date"] = d.isoformat()
    if not partial or "category_id" in data:
        cat = tx.get("expense_categories", data.get("category_id") or "")
        if cat is None:
            raise ValidationFailed("Please choose an expense category.")
        current = tx.get("expenses", data.get("_id") or "") if partial else None
        if not cat.get("active", True) and not (current and current["category_id"] == cat["id"]):
            raise ValidationFailed("That expense category is inactive.")
        out["category_id"] = cat["id"]
        out["category_name"] = cat["name"]
    if not partial or "description" in data:
        desc = str(data.get("description") or "").strip()
        if not desc:
            raise ValidationFailed("Please enter what the expense was for (description).")
        if len(desc) > 200:
            raise ValidationFailed("Description is too long (maximum 200 characters).")
        out["description"] = desc
    if not partial or "amount" in data:
        try:
            amount = D(data.get("amount"))
        except Exception:
            raise ValidationFailed("Amount must be a number.")
        if amount <= 0:
            raise ValidationFailed("Amount must be greater than zero.")
        if amount > MAX_AMOUNT:
            raise ValidationFailed("Amount is too large - please check it.")
        out["amount"] = f(amount)
    if not partial or "payment_method" in data:
        methods = settings_service.get(ctx)["billing"]["payment_methods"]
        method = data.get("payment_method") or settings_service.get(ctx)["expenses"]["default_payment_method"]
        if method not in methods:
            raise ValidationFailed(f"Payment method '{method}' is not available.")
        out["payment_method"] = method
    for key, maxlen in (("payee", 120), ("reference_no", 60), ("notes", 500)):
        if not partial or key in data:
            v = str(data.get(key) or "").strip()
            if len(v) > maxlen:
                raise ValidationFailed(f"{key.replace('_', ' ').capitalize()} is too long.")
            out[key] = v
    return out


def create(ctx: AppContext, user: dict, data: dict) -> dict:
    with ctx.store.transaction() as tx:
        clean = _clean(ctx, tx, data)
        rec = {"id": tx.next_id("EXP", 6), **clean, "receipt": None, "receipt_name": "", "status": "active",
               "created_by": user["id"], "created_by_name": user.get("full_name") or user["username"],
               "created_at": now_iso(), "updated_at": now_iso()}
        tx.insert("expenses", rec)
        audit_service.record(tx, user, "EXPENSE_ADDED", "expense", rec["id"],
                             f"{rec['category_name']}: {rec['description']} - {rec['amount']} ({rec['payment_method']})")
    return rec


def update(ctx: AppContext, user: dict, eid: str, data: dict) -> dict:
    with ctx.store.transaction() as tx:
        rec = tx.require("expenses", eid, "Expense")
        if rec["status"] == "cancelled":
            raise Conflict("A cancelled expense cannot be edited.")
        clean = _clean(ctx, tx, {**data, "_id": eid}, partial=True)
        changes = [f"{k}: {rec.get(k)} -> {v}" for k, v in clean.items() if rec.get(k) != v and k != "category_name"]
        rec.update(clean)
        rec["updated_at"] = now_iso()
        tx.put("expenses", rec)
        audit_service.record(tx, user, "EXPENSE_EDITED", "expense", eid, "; ".join(changes) or "no changes")
    return rec


def cancel(ctx: AppContext, user: dict, eid: str, reason: str) -> dict:
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValidationFailed("Please write the reason for cancelling this expense.")
    with ctx.store.transaction() as tx:
        rec = tx.require("expenses", eid, "Expense")
        if rec["status"] == "cancelled":
            raise Conflict("This expense is already cancelled.")
        rec.update({"status": "cancelled", "cancel_reason": reason, "cancelled_at": now_iso(),
                    "cancelled_by": user["id"], "updated_at": now_iso()})
        tx.put("expenses", rec)
        audit_service.record(tx, user, "EXPENSE_CANCELLED", "expense", eid, f"{rec['description']} ({rec['amount']}): {reason}")
    return rec


def search(ctx: AppContext, *, start: str = "", end: str = "", category_id: str = "", payment_method: str = "",
           payee: str = "", q: str = "", status: str = "") -> list[dict]:
    pq, qq = payee.strip().lower(), q.strip().lower()
    out = []
    for e in ctx.store.all("expenses"):
        if status and e["status"] != status:
            continue
        if category_id and e["category_id"] != category_id:
            continue
        if payment_method and e["payment_method"] != payment_method:
            continue
        if (start or end) and not in_range(e["expense_date"], start or None, end or None):
            continue
        if pq and pq not in (e.get("payee") or "").lower():
            continue
        if qq and qq not in f"{e['description']} {e.get('payee', '')} {e.get('reference_no', '')} {e.get('notes', '')} {e['category_name']}".lower():
            continue
        out.append(e)
    out.sort(key=lambda e: (e["expense_date"], e["created_at"]), reverse=True)
    return out


def present(e: dict, base_path: str = "") -> dict:
    out = dict(e)
    out["receipt_url"] = f"{base_path}/api/files/expenses/{Path(e['receipt']).name}" if e.get("receipt") else None
    return out


# ------------------------------------------------------------------ receipts
def save_receipt(ctx: AppContext, user: dict, eid: str, filename: str, content: bytes) -> dict:
    ext = Path(filename or "").suffix.lower()
    if ext not in RECEIPT_EXTS:
        raise ValidationFailed("Receipts must be PDF, JPG or PNG files.")
    if not content:
        raise ValidationFailed("The receipt file is empty.")
    if len(content) > MAX_RECEIPT_BYTES:
        raise ValidationFailed("The receipt file is too big (maximum 8 MB).")
    if not content.startswith(RECEIPT_EXTS[ext]):
        raise ValidationFailed("The file content does not match its type. Please choose a real PDF, JPG or PNG file.")
    folder = ctx.settings.uploads_dir / "expenses"
    folder.mkdir(parents=True, exist_ok=True)
    with ctx.store.transaction() as tx:
        rec = tx.require("expenses", eid, "Expense")
        name = f"{eid}-{secrets.token_hex(4)}{ext}"
        target = folder / name
        tmp = target.with_suffix(".tmp")
        tmp.write_bytes(content)
        tmp.replace(target)
        old = rec.get("receipt")
        rec["receipt"] = f"uploads/expenses/{name}"
        rec["receipt_name"] = Path(filename).name[:80]
        rec["updated_at"] = now_iso()
        tx.put("expenses", rec)
        audit_service.record(tx, user, "EXPENSE_EDITED", "expense", eid, f"Receipt attached ({rec['receipt_name']})")
    if old:
        (folder / Path(old).name).unlink(missing_ok=True)
    return rec


def date_range_total(ctx: AppContext, start: str, end: str) -> float:
    return f(sum(D(e["amount"]) for e in ctx.store.all("expenses")
                 if e["status"] == "active" and in_range(e["expense_date"], start, end)))

