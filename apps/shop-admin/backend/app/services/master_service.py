"""Dynamic master lists: product categories, sub-categories, vendors, locations, expense categories.

Nothing here is hard-coded into the software - the admin adds/edits/deactivates them from the screens.
Records are never deleted (products and bills refer to them); they are deactivated instead.
"""
from __future__ import annotations

import re
from typing import Any

from app.core.context import AppContext
from app.core.errors import Conflict, ValidationFailed
from app.services import audit_service
from app.utils.dates import now_iso

# field -> (max length, required)
MASTERS: dict[str, dict[str, Any]] = {
    "categories": {
        "label": "Category", "prefix": "CAT", "width": 4, "perm": "admin.categories",
        "fields": {"name": (80, True), "code": (6, True), "description": (300, False)},
        "unique": ["name", "code"],
    },
    "subcategories": {
        "label": "Sub-category", "prefix": "SUB", "width": 4, "perm": "admin.categories",
        "fields": {"name": (80, True), "category_id": (30, True), "description": (300, False)},
        "unique": [],
    },
    "vendors": {
        "label": "Vendor", "prefix": "VEN", "width": 4, "perm": "admin.vendors",
        "fields": {"name": (120, True), "contact_person": (80, False), "phone": (30, False), "email": (120, False),
                   "address": (300, False), "city": (60, False), "state": (60, False), "gst_number": (20, False),
                   "notes": (500, False)},
        "unique": ["name"],
    },
    "locations": {
        "label": "Location", "prefix": "LOC", "width": 4, "perm": "admin.locations",
        "fields": {"name": (80, True), "address": (300, False), "notes": (300, False)},
        "unique": ["name"],
    },
    "expense_categories": {
        "label": "Expense category", "prefix": "ECT", "width": 4, "perm": "admin.categories",
        "fields": {"name": (80, True), "description": (300, False)},
        "unique": ["name"],
    },
}

DEFAULT_EXPENSE_CATEGORIES = [
    "Shop Rent", "Electricity", "Marketing", "Transportation", "Travel", "Packaging", "Printing", "Furniture",
    "Shop Decoration", "Equipment", "Computer", "Printer", "Software", "Internet", "Phone", "Staff", "Maintenance",
    "Repair", "Bank Charges", "Miscellaneous", "Other",
]

CODE_RE = re.compile(r"^[A-Z0-9]{2,6}$")


def _clean(kind: str, data: dict, partial: bool) -> dict:
    spec = MASTERS[kind]
    out: dict[str, Any] = {}
    for field, (maxlen, required) in spec["fields"].items():
        if field not in data:
            if required and not partial:
                raise ValidationFailed(f"{field.replace('_', ' ').capitalize()} is required.")
            continue
        val = data[field]
        val = (str(val).strip() if val is not None else "")
        if required and not val:
            raise ValidationFailed(f"{field.replace('_', ' ').capitalize()} is required.")
        if len(val) > maxlen:
            raise ValidationFailed(f"{field.replace('_', ' ').capitalize()} is too long (maximum {maxlen} characters).")
        out[field] = val
    if kind == "categories" and "code" in out:
        out["code"] = out["code"].upper()
        if not CODE_RE.match(out["code"]):
            raise ValidationFailed("Category code must be 2-6 capital letters or digits (e.g. EAR, JHM).")
    if kind == "vendors" and out.get("email") and "@" not in out["email"]:
        raise ValidationFailed("Vendor email does not look valid.")
    return out


def list_items(ctx: AppContext, kind: str, include_inactive: bool = True, category_id: str | None = None) -> list[dict]:
    items = ctx.store.all(kind)
    if not include_inactive:
        items = [i for i in items if i.get("active", True)]
    if category_id:
        items = [i for i in items if i.get("category_id") == category_id]
    return sorted(items, key=lambda i: i["name"].lower())


def _check_unique(tx, kind: str, rec: dict, existing_id: str | None) -> None:
    for field in MASTERS[kind]["unique"]:
        val = (rec.get(field) or "").lower()
        for other in tx.iter_all(kind):
            if other["id"] != existing_id and (other.get(field) or "").lower() == val:
                raise Conflict(f"A {MASTERS[kind]['label'].lower()} with this {field} already exists.")
    if kind == "subcategories":
        for other in tx.iter_all(kind):
            if (other["id"] != existing_id and other["category_id"] == rec["category_id"]
                    and other["name"].lower() == rec["name"].lower()):
                raise Conflict("This sub-category already exists in that category.")


def create(ctx: AppContext, user: dict, kind: str, data: dict) -> dict:
    spec = MASTERS[kind]
    clean = _clean(kind, data, partial=False)
    with ctx.store.transaction() as tx:
        if kind == "subcategories" and not tx.exists("categories", clean["category_id"]):
            raise ValidationFailed("The category for this sub-category does not exist.")
        _check_unique(tx, kind, clean, None)
        rec = {"id": tx.next_id(spec["prefix"], spec["width"]), **clean, "active": True,
               "created_at": now_iso(), "created_by": user["id"]}
        tx.insert(kind, rec)
        audit_service.record(tx, user, "MASTER_CHANGED", kind, rec["id"], f"Added {spec['label'].lower()} '{rec['name']}'")
    return rec


def update(ctx: AppContext, user: dict, kind: str, rid: str, data: dict) -> dict:
    spec = MASTERS[kind]
    clean = _clean(kind, data, partial=True)
    with ctx.store.transaction() as tx:
        rec = tx.require(kind, rid, spec["label"])
        rec.update(clean)
        if "active" in data and data["active"] is not None:
            new_active = bool(data["active"])
            if kind == "locations" and rec.get("active", True) and not new_active:
                stock = sum(p["stock"].get(rid, 0) for p in tx.iter_all("products") if p.get("status") != "deleted")
                if stock > 0:
                    raise Conflict(f"This location still holds {stock} pieces of stock. Transfer the stock to another "
                                   f"location before deactivating it.")
            rec["active"] = new_active
        if kind == "subcategories" and not tx.exists("categories", rec["category_id"]):
            raise ValidationFailed("The category for this sub-category does not exist.")
        _check_unique(tx, kind, rec, rid)
        rec["updated_at"] = now_iso()
        tx.put(kind, rec)
        audit_service.record(tx, user, "MASTER_CHANGED", kind, rid, f"Edited {spec['label'].lower()} '{rec['name']}' (active={rec['active']})")
    return rec


def seed_expense_categories(ctx: AppContext) -> None:
    """Default expense categories are created once, on first start (admin may edit / deactivate them)."""
    if ctx.store.all("expense_categories") or ctx.store.doc("counters").get("expense_categories_seeded"):
        return
    with ctx.store.transaction() as tx:
        for name in DEFAULT_EXPENSE_CATEGORIES:
            tx.insert("expense_categories", {"id": tx.next_id("ECT", 4), "name": name, "description": "",
                                             "active": True, "created_at": now_iso(), "created_by": ""})
        tx.doc("counters")["expense_categories_seeded"] = 1
