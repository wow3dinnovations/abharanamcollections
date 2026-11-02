"""Code 128 barcodes and label data.

The Code 128 encoding is done by the ``python-barcode`` library (so the bars are always correct);
this module turns the bar pattern into a small scalable SVG that fits any label size.
"""
from __future__ import annotations

import barcode

from app.core.context import AppContext
from app.core.errors import ValidationFailed
from app.models.records import SKU_RE
from app.services import audit_service, settings_service
from app.utils.dates import date_of, in_range, now_iso

QUIET_MODULES = 8


def bar_pattern(code: str) -> str:
    if not SKU_RE.match(code or ""):
        raise ValidationFailed(f"'{code}' cannot be made into a barcode (letters, digits, '.', '_' and '-' only).")
    return barcode.get("code128", code).build()[0]


def svg(code: str) -> str:
    """A self-contained scalable SVG.  Stretch it to any width/height with CSS."""
    bits = bar_pattern(code)
    total = len(bits) + 2 * QUIET_MODULES
    parts = []
    i = 0
    while i < len(bits):
        if bits[i] == "1":
            j = i
            while j < len(bits) and bits[j] == "1":
                j += 1
            parts.append(f"M{i + QUIET_MODULES} 0h{j - i}v1h-{j - i}z")
            i = j
        else:
            i += 1
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {total} 1" preserveAspectRatio="none" '
            f'shape-rendering="crispEdges" role="img" aria-label="Barcode {code}">'
            f'<rect width="{total}" height="1" fill="#fff"/><path fill="#000" d="{"".join(parts)}"/></svg>')


def labels(ctx: AppContext, items: list[dict]) -> dict:
    """Label data (name, price, sku, barcode picture) for the print screen."""
    if not items:
        raise ValidationFailed("Choose at least one product.")
    cfg = settings_service.get(ctx)
    out = []
    total = 0
    for it in items:
        p = ctx.store.get("products", it.get("product_id", ""))
        if p is None or p["status"] == "deleted":
            raise ValidationFailed("One of the products was not found.")
        copies = int(it.get("copies", 1))
        if copies < 1 or copies > 500:
            raise ValidationFailed("Number of labels must be between 1 and 500.")
        total += copies
        out.append({"product_id": p["id"], "sku": p["sku"], "barcode": p["barcode"], "name": p["name"],
                    "price": p["selling_price"], "copies": copies, "svg": svg(p["barcode"])})
    return {"labels": out, "total_labels": total, "business_name": cfg["business"]["name"],
            "label_sizes": cfg["inventory"]["label_sizes"], "default_label_size_id": cfg["inventory"]["label_size_id"],
            "module_mm": cfg["inventory"].get("barcode_module_mm", 0), "rotate": bool(cfg["printer"].get("rotate", False))}


def record_print_job(ctx: AppContext, user: dict, items: list[dict], label_size_id: str, reprint_of: str = "") -> dict:
    cfg = settings_service.get(ctx)
    sizes = {s["id"]: s for s in cfg["inventory"]["label_sizes"]}
    if label_size_id not in sizes:
        raise ValidationFailed("Unknown label size.")
    lines = []
    with ctx.store.transaction() as tx:
        for it in items:
            p = tx.get("products", it.get("product_id", ""))
            copies = int(it.get("copies", 1))
            if p is None or copies < 1:
                raise ValidationFailed("Invalid label list.")
            lines.append({"product_id": p["id"], "sku": p["sku"], "name": p["name"], "price": p["selling_price"], "copies": copies})
        job = {"id": tx.next_id("BPJ", 6), "date_time": now_iso(), "label_size_id": label_size_id,
               "label_size": sizes[label_size_id]["name"], "items": lines, "total_labels": sum(l["copies"] for l in lines),
               "user_id": user["id"], "username": user["username"], "reprint_of": reprint_of,
               "printer": cfg["printer"].get("name", "")}
        tx.insert("barcode_print_jobs", job)
        audit_service.record(tx, user, "BARCODE_PRINTED", "barcode_print_job", job["id"],
                             f"{job['total_labels']} labels ({job['label_size']})" + (f", reprint of {reprint_of}" if reprint_of else ""))
    return job


def list_jobs(ctx: AppContext, start: str = "", end: str = "") -> list[dict]:
    rows = [j for j in ctx.store.all("barcode_print_jobs") if in_range(date_of(j["date_time"]), start or None, end or None)]
    return sorted(rows, key=lambda j: j["date_time"], reverse=True)
