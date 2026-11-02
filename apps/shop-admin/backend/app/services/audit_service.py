"""Audit trail.  ``record`` adds a line to audit_logs.json inside the SAME transaction as the change."""
from __future__ import annotations

from typing import Any

from app.core.context import AppContext
from app.storage.json_store import Transaction
from app.utils.dates import now_iso

# every action name in one place
ACTIONS = [
    "LOGIN", "LOGOUT", "LOGIN_FAILED", "PRODUCT_ADDED", "PRODUCT_EDITED", "PRODUCT_DELETED",
    "PURCHASE_ADDED", "PURCHASE_EDITED", "INVENTORY_CHANGED", "STOCK_TRANSFER", "SALE_CREATED",
    "SALE_CANCELLED", "BILL_REPRINTED", "EXPENSE_ADDED", "EXPENSE_EDITED", "EXPENSE_CANCELLED",
    "DISCOUNT_APPLIED", "STAFF_CREATED", "STAFF_UPDATED", "PERMISSION_CHANGED", "PASSWORD_CHANGED",
    "PASSWORD_RESET", "SETTINGS_CHANGED", "BACKUP_CREATED", "BACKUP_RESTORED", "MASTER_CHANGED",
    "BARCODE_PRINTED", "DATA_IMPORTED", "DATA_EXPORTED", "DEMO_DATA",
]


def record(tx: Transaction, user: dict | None, action: str, entity: str = "", entity_id: str = "",
           details: Any = "") -> dict:
    entry = {
        "id": tx.next_id("AUD", 7),
        "timestamp": now_iso(),
        "user_id": (user or {}).get("id", ""),
        "username": (user or {}).get("username", "system"),
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "details": details,
    }
    return tx.insert("audit_logs", entry)


def log_now(ctx: AppContext, user: dict | None, action: str, entity: str = "", entity_id: str = "",
            details: Any = "") -> None:
    """Stand-alone audit entry (for events that change nothing else, e.g. login)."""
    with ctx.store.transaction() as tx:
        record(tx, user, action, entity, entity_id, details)
