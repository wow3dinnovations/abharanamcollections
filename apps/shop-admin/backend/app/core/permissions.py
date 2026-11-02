"""The permission catalogue.

Admin can give each staff member any combination of these.  The backend checks
them on every API call - hiding a button in the screen is never the only protection.
"""
from __future__ import annotations

# (key, label)  grouped for display
PERMISSION_GROUPS: list[tuple[str, list[tuple[str, str]]]] = [
    ("Inventory", [
        ("inventory.view", "View Inventory"),
        ("inventory.add_product", "Add Product"),
        ("inventory.edit_product", "Edit Product"),
        ("inventory.delete_product", "Delete Product"),
        ("inventory.adjust_stock", "Adjust Stock"),
        ("inventory.transfer_stock", "Transfer Stock"),
    ]),
    ("Purchases", [
        ("purchases.view", "View Purchases"),
        ("purchases.add", "Add Purchase"),
        ("purchases.edit", "Edit Purchase"),
    ]),
    ("Sales", [
        ("sales.create", "Create Sale"),
        ("sales.view", "View Sales"),
        ("sales.cancel", "Cancel Sale"),
        ("sales.return", "Return Sale"),
        ("sales.discount", "Give Discount"),
    ]),
    ("Billing", [
        ("billing.generate", "Generate Bill"),
        ("billing.reprint", "Reprint Bill"),
    ]),
    ("Barcode", [
        ("barcode.print", "Print Barcode"),
        ("barcode.reprint", "Reprint Barcode"),
    ]),
    ("Customers", [
        ("customers.view", "View Customers"),
        ("customers.manage", "Add / Edit Customers"),
    ]),
    ("Reports", [
        ("reports.daily_sales", "Daily Sales"),
        ("reports.monthly_sales", "Monthly Sales"),
        ("reports.sales_detail", "Product / Category / Staff / Payment Sales"),
        ("reports.inventory", "Inventory"),
        ("reports.old_stock", "Old Stock"),
        ("reports.purchases", "Purchase Reports"),
        ("reports.expenses", "Expense Reports"),
        ("reports.profitability", "Profitability"),
    ]),
    ("Expenses", [
        ("expenses.view", "View Expenses"),
        ("expenses.add", "Add Expense"),
        ("expenses.edit", "Edit Expense"),
        ("expenses.cancel", "Delete / Cancel Expense"),
    ]),
    ("Data", [
        ("data.import", "Import Data (Excel / CSV)"),
        ("data.export", "Export Data (Excel)"),
    ]),
    ("Administration", [
        ("admin.vendors", "Manage Vendors"),
        ("admin.categories", "Manage Categories"),
        ("admin.locations", "Manage Locations"),
        ("admin.staff", "Manage Staff"),
        ("admin.settings", "Manage Settings"),
        ("admin.backup", "Backup"),
        ("admin.restore", "Restore"),
        ("admin.audit_logs", "Audit Logs"),
        ("admin.data_health", "Data Health"),
    ]),
    ("Website", [
        ("website.publish", "Publish to Website"),
    ]),
]

ALL_PERMISSIONS: list[str] = [k for _, items in PERMISSION_GROUPS for k, _ in items]
PERMISSION_LABELS: dict[str, str] = {k: label for _, items in PERMISSION_GROUPS for k, label in items}


def permission_records() -> list[dict]:
    """The content of permissions.json."""
    out = []
    for group, items in PERMISSION_GROUPS:
        for key, label in items:
            out.append({"id": key, "key": key, "group": group, "label": label})
    return out


# Ready-made permission sets Admin can apply when creating staff (editable in Roles & Permissions).
DEFAULT_ROLES: list[dict] = [
    {"id": "ROLE-ADMIN", "name": "Admin", "description": "Full access to everything.",
     "permissions": ALL_PERMISSIONS, "is_system": True},
    {"id": "ROLE-CASHIER", "name": "Cashier",
     "description": "Billing counter: can bill customers, print barcodes and see stock.",
     "permissions": ["inventory.view", "sales.create", "sales.view", "billing.generate",
                     "billing.reprint", "barcode.print", "barcode.reprint", "customers.view",
                     "customers.manage"],
     "is_system": False},
    {"id": "ROLE-INVENTORY", "name": "Inventory Manager",
     "description": "Manages products, stock, purchases and barcodes.",
     "permissions": ["inventory.view", "inventory.add_product", "inventory.edit_product",
                     "inventory.adjust_stock", "inventory.transfer_stock", "purchases.view",
                     "purchases.add", "purchases.edit", "barcode.print", "barcode.reprint",
                     "reports.inventory", "reports.old_stock", "data.export"],
     "is_system": False},
    {"id": "ROLE-MANAGER", "name": "Shop Manager",
     "description": "Runs the shop day to day: sales, stock, purchases, expenses and reports.",
     "permissions": [p for p in ALL_PERMISSIONS if not p.startswith("admin.") and p != "reports.profitability"],
     "is_system": False},
]
