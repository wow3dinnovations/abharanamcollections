"""First-start set-up: permission list, ready-made roles and settings are created in the data files."""
from __future__ import annotations

import logging

from app.core.context import AppContext
from app.core.permissions import DEFAULT_ROLES, permission_records
from app.models.settings import merge_settings
from app.services import master_service


log = logging.getLogger("abharanam.bootstrap")

# id prefix -> the file those ids live in
ID_PREFIXES = {"USR": "users", "ROLE": "roles", "CAT": "categories", "SUB": "subcategories", "VEN": "vendors", "LOC": "locations",
               "PRD": "products", "PUR": "purchases", "TXN": "inventory_transactions", "TRF": "stock_transfers", "CUS": "customers",
               "SAL": "sales", "EXP": "expenses", "ECT": "expense_categories", "PAY": "payments", "BPJ": "barcode_print_jobs",
               "AUD": "audit_logs"}


def repair_counters(ctx: AppContext) -> list[str]:
    """Make sure the ID counters are never behind the data (after a hand-edited file or a partial copy).

    A counter that is behind would try to re-use an ID that already exists.  Returns what was repaired.
    """
    store = ctx.store
    counters = store.doc("counters")
    fixes: dict[str, int] = {}
    for prefix, name in ID_PREFIXES.items():
        if store.status()[name].state == "corrupted":
            continue
        top = 0
        for rec in store.all(name):
            tail = str(rec["id"]).rsplit("-", 1)[-1]
            if tail.isdigit():
                top = max(top, int(tail))
        if top > int(counters.get(prefix, 0)):
            fixes[prefix] = top
    if store.status()["sales"].state != "corrupted":
        top = 0
        for s in store.all("sales"):
            tail = str(s.get("invoice_number", "")).rsplit("-", 1)[-1]
            if tail.isdigit():
                top = max(top, int(tail))
        if top > int(counters.get("invoice", 0)):
            fixes["invoice"] = top
    if fixes:
        with store.transaction() as tx:
            tx.doc("counters").update(fixes)
        log.warning("ID counters were behind the data and were repaired: %s", fixes)
    return [f"{k} -> {v}" for k, v in fixes.items()]


def bootstrap(ctx: AppContext) -> None:
    store = ctx.store
    if store.corrupted():
        return  # never touch a damaged file - the admin must restore a backup
    with store.transaction() as tx:
        # permissions.json always mirrors the permissions the software knows about
        want = permission_records()
        if [r["id"] for r in store.all("permissions")] != [r["id"] for r in want]:
            for r in list(tx.iter_all("permissions")):
                tx.delete("permissions", r["id"])
            for r in want:
                tx.insert("permissions", r)
        # ready-made roles (created once; the admin may edit them later)
        if not store.all("roles"):
            for r in DEFAULT_ROLES:
                tx.insert("roles", dict(r))
        else:
            admin_role = store.get("roles", "ROLE-ADMIN")
            if admin_role is not None and set(admin_role.get("permissions", [])) != set(DEFAULT_ROLES[0]["permissions"]):
                upd = tx.require("roles", "ROLE-ADMIN")
                upd["permissions"] = DEFAULT_ROLES[0]["permissions"]
                tx.put("roles", upd)
        # settings: make sure every option exists
        merged = merge_settings(store.doc("settings"))
        if not store.doc("counters").get("preset_label_12x18"):     # add the 12 x 18 mm tag ONCE (an admin may delete it later)
            sizes = merged["inventory"]["label_sizes"]
            if not any(x["id"] == "12x18" for x in sizes):
                sizes.insert(0, {"id": "12x18", "name": "12mm x 18mm", "width_mm": 18, "height_mm": 12})
            tx.doc("counters")["preset_label_12x18"] = 1
        if merged != store.doc("settings"):
            doc = tx.doc("settings")
            doc.clear()
            doc.update(merged)
        # starting invoice counter
        if "invoice" not in store.doc("counters"):
            tx.doc("counters")["invoice"] = int(merged["billing"].get("starting_invoice_number", 1)) - 1

    master_service.seed_expense_categories(ctx)
    repair_counters(ctx)
