"""The list of JSON files the application owns."""
from __future__ import annotations

from app.models import records as m
from app.models.settings import default_settings
from app.storage.json_store import CollectionSpec

# Files listed in the order they appear in backups / health checks.
SPECS: list[CollectionSpec] = [
    CollectionSpec("users", model=m.User),
    CollectionSpec("roles", model=m.Role),
    CollectionSpec("permissions"),
    CollectionSpec("categories", model=m.Category),
    CollectionSpec("subcategories", model=m.Subcategory),
    CollectionSpec("vendors", model=m.Vendor),
    CollectionSpec("locations", model=m.Location),
    CollectionSpec("products", model=m.Product),
    CollectionSpec("purchases", model=m.Purchase),
    CollectionSpec("inventory_transactions", model=m.InventoryTransaction),
    CollectionSpec("stock_transfers", model=m.StockTransfer),
    CollectionSpec("customers", model=m.Customer),
    CollectionSpec("sales", model=m.Sale),
    CollectionSpec("expenses", model=m.Expense),
    CollectionSpec("expense_categories", model=m.ExpenseCategory),
    CollectionSpec("payments", model=m.Payment),
    CollectionSpec("barcode_print_jobs"),
    CollectionSpec("audit_logs", model=m.AuditLog),
    CollectionSpec("settings", kind="doc", default_doc=default_settings()),
    CollectionSpec("counters", kind="doc"),
    # What was last published to the customer website (fingerprints only, no business data).
    CollectionSpec("website_sync", kind="doc", critical=False),
]

CORE_FILES = [s.filename for s in SPECS]
