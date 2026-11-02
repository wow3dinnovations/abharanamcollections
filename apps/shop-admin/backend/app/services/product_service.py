"""Products: create, edit, search, barcode lookup, images."""
from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError

from app.core.context import AppContext
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.models.records import SKU_RE
from app.services import audit_service, inventory_service, purchase_service, settings_service
from app.utils.dates import age_bucket, age_months, date_of, in_range, now_iso, product_age_days, today_iso
from app.utils.money import D, f

COST_PERMS = ("purchases.view", "inventory.add_product", "inventory.edit_product", "reports.inventory",
              "reports.profitability", "reports.purchases", "reports.old_stock")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_BYTES = 6 * 1024 * 1024


def can_see_cost(user: dict) -> bool:
    if user["role"] == "admin":
        return True
    have = set(user.get("permissions", []))
    return any(p in have for p in COST_PERMS)


# ------------------------------------------------------------------ helpers
def _maps(ctx: AppContext) -> dict[str, dict[str, str]]:
    s = ctx.store
    return {k: {r["id"]: r["name"] for r in s.all(k)} for k in ("categories", "subcategories", "vendors", "locations")}


def code_index(ctx: AppContext) -> dict[str, str]:
    """UPPER(sku or barcode) -> product id, for every product (kept up to date automatically)."""
    def build(rows: list[dict]) -> dict[str, str]:
        idx: dict[str, str] = {}
        for p in rows:
            idx[p["sku"].upper()] = p["id"]
            idx[p["barcode"].upper()] = p["id"]
        return idx
    return ctx.store.derived("products", "codes", build)


def _search_blob_index(ctx: AppContext) -> dict[str, str]:
    def build(rows: list[dict]) -> dict[str, str]:
        return {p["id"]: " ".join(str(x) for x in (
            p["sku"], p["barcode"], p["name"], p.get("design_number", ""), p.get("collection", ""),
            p.get("colour", ""), p.get("material", ""), p.get("description", ""), " ".join(p.get("tags", [])))).lower()
            for p in rows}
    return ctx.store.derived("products", "blob", build)


def _normalise_code(value: str, what: str) -> str:
    v = (value or "").strip().upper()
    if not SKU_RE.match(v):
        raise ValidationFailed(f"{what} must be 2-40 characters: letters, digits, '.', '_' or '-' (no spaces).")
    return v


def _num(value: Any, field: str, *, minimum: float = 0, allow_none: bool = False, maximum: float | None = None):
    if value is None or value == "":
        if allow_none:
            return None
        raise ValidationFailed(f"{field} is required.")
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise ValidationFailed(f"{field} must be a number.")
    if n != n or n in (float("inf"), float("-inf")):
        raise ValidationFailed(f"{field} is not a valid number.")
    if n < minimum:
        raise ValidationFailed(f"{field} cannot be negative." if minimum == 0 else f"{field} must be at least {minimum}.")
    if maximum is not None and n > maximum:
        raise ValidationFailed(f"{field} cannot be more than {maximum}.")
    return n


def _int(value: Any, field: str, minimum: int = 0) -> int:
    try:
        n = float(value if value not in (None, "") else 0)
    except (TypeError, ValueError):
        raise ValidationFailed(f"{field} must be a whole number.")
    if n != int(n):
        raise ValidationFailed(f"{field} must be a whole number of pieces.")
    if int(n) < minimum:
        raise ValidationFailed(f"{field} cannot be negative.")
    return int(n)


def _text(data: dict, key: str, maxlen: int = 200) -> str:
    v = str(data.get(key) or "").strip()
    if len(v) > maxlen:
        raise ValidationFailed(f"{key.replace('_', ' ').capitalize()} is too long.")
    return v


# ------------------------------------------------------------------ presenting
def present(ctx: AppContext, p: dict, user: dict, maps: dict | None = None, on=None) -> dict:
    maps = maps or _maps(ctx)
    cfg = settings_service.get(ctx)["inventory"]
    qty = inventory_service.total_stock(p)
    days = product_age_days(p["date_added"], on)
    out = dict(p)
    out["current_quantity"] = qty
    out["stock_by_location"] = sorted(
        [{"location_id": lid, "location_name": maps["locations"].get(lid, lid), "quantity": q}
         for lid, q in p["stock"].items() if q > 0], key=lambda r: r["location_name"])
    out["category_name"] = maps["categories"].get(p["category_id"], "")
    out["subcategory_name"] = maps["subcategories"].get(p.get("subcategory_id", ""), "")
    out["vendor_name"] = maps["vendors"].get(p.get("vendor_id", ""), "")
    out["age_days"], out["age_months"], out["age_bucket"] = days, age_months(days), age_bucket(days)
    out["is_out_of_stock"] = qty == 0
    out["is_low_stock"] = 0 < qty <= cfg["low_stock_threshold"]
    out["is_old_stock"] = qty > 0 and days > cfg["old_stock_days"]
    out["retail_value"] = f(D(p["selling_price"]) * qty)
    out["image_url"] = ctx.settings.url(f"/api/files/products/{Path(p['image']).name}?v={p.get('image_version', 0)}") if p.get("image") else None
    if can_see_cost(user):
        out["stock_value"] = f(D(p["purchase_rate"]) * qty)
    else:
        for k in ("purchase_rate", "last_purchase_rate", "vendor_id", "vendor_name", "purchase_invoice_no",
                  "purchase_location_id", "purchase_date", "min_selling_price"):
            out.pop(k, None)
    return out


# ------------------------------------------------------------------ create
def _validate_refs(tx, data: dict, qty: int) -> tuple[str, str]:
    cat = tx.get("categories", data.get("category_id") or "")
    if cat is None:
        raise ValidationFailed("Please choose a category.")
    if not cat.get("active", True):
        raise ValidationFailed("That category is inactive.")
    sub_id = data.get("subcategory_id") or ""
    if sub_id:
        sub = tx.get("subcategories", sub_id)
        if sub is None or sub["category_id"] != cat["id"]:
            raise ValidationFailed("That sub-category does not belong to the chosen category.")
    vendor_id = data.get("vendor_id") or ""
    if vendor_id and tx.get("vendors", vendor_id) is None:
        raise ValidationFailed("That vendor does not exist.")
    loc_id = data.get("purchase_location_id") or ""
    if qty > 0:
        loc = tx.get("locations", loc_id)
        if loc is None:
            raise ValidationFailed("Please choose the location where this stock is kept.")
        if not loc.get("active", True):
            raise ValidationFailed("That location is inactive.")
    elif loc_id and tx.get("locations", loc_id) is None:
        raise ValidationFailed("That location does not exist.")
    return cat["code"], cat["id"]


def _tags(value: Any) -> list[str]:
    if isinstance(value, str):
        value = [t for t in re.split(r"[,;]", value)]
    return [t.strip() for t in (value or []) if str(t).strip()][:20]


def _next_short_barcode(ctx: AppContext, tx, codes: dict, taken: set[str]) -> str:
    """A short all-digit barcode (e.g. 100123): small enough to print on a tiny tag, still unique."""
    digits = int(settings_service.get(ctx)["inventory"].get("short_barcode_digits", 6))
    for _ in range(100000):
        n = tx.next_number("barcode", start=10 ** (digits - 1))          # 6 digits -> 100000, 100001, ...
        candidate = str(n)
        if len(candidate) > 12:
            raise Conflict("The short barcode numbers are used up. Increase the number of digits in Settings.")
        if candidate not in codes and candidate not in taken:
            return candidate
    raise Conflict("Could not generate a free barcode.")  # pragma: no cover


_LAST_NUMBER = re.compile(r"(\d+)(?!.*\d)")


def _bump(code: str) -> str:
    """IB4501 -> IB4502, IH615-LOT009 -> IH615-LOT010 (keeps leading zeros); no digits -> add 1."""
    m = _LAST_NUMBER.search(code)
    if not m:
        return f"{code}1"
    digits = m.group(1)
    return f"{code[:m.start()]}{str(int(digits) + 1).zfill(len(digits))}{code[m.end():]}"


def suggest_code(ctx: AppContext, category_id: str, vendor_id: str = "", location_id: str = "") -> dict:
    """The next product code for this category + vendor + location, following the last product added with the
    same three.  If there is none, it follows the last one with the same category + location.  Empty sku when
    nothing matches (then the shop's automatic ABH-CAT-###### code is used)."""
    if not category_id:
        return {"sku": "", "based_on": "", "match": ""}
    rows = [p for p in ctx.store.all("products") if p["status"] != "deleted" and p["category_id"] == category_id
            and (p.get("purchase_location_id") or "") == (location_id or "")]
    exact = [p for p in rows if (p.get("vendor_id") or "") == (vendor_id or "")]
    pool, match = (exact, "category_vendor_location") if exact else (rows, "category_location")
    if not pool:
        return {"sku": "", "based_on": "", "match": ""}
    last = max(pool, key=lambda p: (p.get("date_added", ""), p["id"]))
    codes = code_index(ctx)
    candidate = last["sku"]
    for _ in range(10000):
        candidate = _bump(candidate)
        if len(candidate) > 40 or not SKU_RE.match(candidate):
            return {"sku": "", "based_on": last["sku"], "match": match}
        if candidate not in codes:
            return {"sku": candidate, "based_on": last["sku"], "match": match}
    return {"sku": "", "based_on": last["sku"], "match": match}  # pragma: no cover


def build_product(ctx: AppContext, tx, user: dict, data: dict, taken_codes: set[str] | None = None) -> tuple[dict, int]:
    """Validate and build a NEW product record (not yet saved).  Returns (product, opening_quantity)."""
    name = _text(data, "name", 150)
    if not name:
        raise ValidationFailed("Product name is required.")
    qty = _int(data.get("initial_quantity", 0), "Quantity")
    cat_code, cat_id = _validate_refs(tx, data, qty)
    purchase_rate = _num(data.get("purchase_rate", 0), "Purchase rate")
    selling_price = _num(data.get("selling_price"), "Selling price")
    min_price = _num(data.get("min_selling_price"), "Minimum selling price", allow_none=True)
    disc = _num(data.get("discount_allowed_percent"), "Discount allowed", allow_none=True, maximum=100)
    if min_price is not None and min_price > selling_price:
        raise ValidationFailed("Minimum selling price cannot be more than the selling price.")

    codes = code_index(ctx)
    taken = taken_codes if taken_codes is not None else set()
    prefix = settings_service.get(ctx)["inventory"]["sku_prefix"].upper()

    sku = (data.get("sku") or "").strip()
    if sku:
        sku = _normalise_code(sku, "SKU")
    else:
        for _ in range(1000):
            n = tx.next_number(f"sku:{cat_code}")
            candidate = f"{prefix}-{cat_code}-{n:06d}"
            if candidate not in codes and candidate not in taken:
                sku = candidate
                break
        else:  # pragma: no cover
            raise Conflict("Could not generate a free SKU.")
    barcode = (data.get("barcode") or "").strip()
    if barcode:
        barcode = _normalise_code(barcode, "Barcode")
    elif settings_service.get(ctx)["inventory"].get("barcode_mode") == "short":
        barcode = _next_short_barcode(ctx, tx, codes, taken)
    else:
        barcode = sku
    for code, what in ((sku, "SKU"), (barcode, "Barcode")):
        if code in codes or code in taken:
            raise Conflict(f"The {what} '{code}' is already used by another product.")
    taken.update({sku, barcode})     # (matters for bulk imports, where several new products are checked together)

    now = now_iso()
    product = {
        "id": tx.next_id("PRD", 6), "sku": sku, "barcode": barcode, "name": name,
        "category_id": cat_id, "subcategory_id": data.get("subcategory_id") or "",
        "description": _text(data, "description", 1000), "image": None, "image_version": 0,
        "design_number": _text(data, "design_number", 60), "size": _text(data, "size", 40),
        "colour": _text(data, "colour", 40), "material": _text(data, "material", 60),
        "collection": _text(data, "collection", 60), "tags": _tags(data.get("tags")),
        "vendor_id": data.get("vendor_id") or "", "purchase_location_id": data.get("purchase_location_id") or "",
        "purchase_date": date_of(data.get("purchase_date") or today_iso()),
        "purchase_invoice_no": _text(data, "purchase_invoice_no", 60),
        "purchase_rate": f(purchase_rate), "last_purchase_rate": f(purchase_rate),
        "selling_price": f(selling_price), "min_selling_price": f(min_price) if min_price is not None else None,
        "discount_allowed_percent": disc,
        "initial_quantity": qty, "sold_quantity": 0, "stock": {}, "rack": _text(data, "rack", 60),
        "status": "active", "date_added": now, "updated_at": now, "created_by": user["id"],
    }
    return product, qty


def create_product(ctx: AppContext, user: dict, data: dict) -> dict:
    with ctx.store.transaction() as tx:
        product, qty = build_product(ctx, tx, user, data)
        tx.insert("products", product)
        if qty > 0:
            purchase_service.record_opening_purchase(ctx, tx, user, product, qty)
        audit_service.record(tx, user, "PRODUCT_ADDED", "product", product["id"],
                             f"{product['sku']} '{product['name']}' qty {qty} @ cost {product['purchase_rate']} sell {product['selling_price']}")
    return present(ctx, ctx.store.get("products", product["id"]), user)


# ------------------------------------------------------------------ update / delete
EDITABLE_TEXT = ("description", "design_number", "size", "colour", "material", "collection", "rack", "purchase_invoice_no")


def update_product(ctx: AppContext, user: dict, product_id: str, data: dict) -> dict:
    with ctx.store.transaction() as tx:
        p = tx.require("products", product_id, "Product")
        if p["status"] == "deleted":
            raise Conflict("This product has been deleted.")
        old_price = p["selling_price"]
        changes = []
        if "name" in data:
            name = _text(data, "name", 150)
            if not name:
                raise ValidationFailed("Product name is required.")
            p["name"] = name
        if "category_id" in data or "subcategory_id" in data:
            merged = {"category_id": data.get("category_id", p["category_id"]),
                      "subcategory_id": data.get("subcategory_id", p.get("subcategory_id", ""))}
            _validate_refs(tx, merged, 0)
            p["category_id"], p["subcategory_id"] = merged["category_id"], merged["subcategory_id"] or ""
        if "vendor_id" in data:
            if data["vendor_id"] and tx.get("vendors", data["vendor_id"]) is None:
                raise ValidationFailed("That vendor does not exist.")
            p["vendor_id"] = data["vendor_id"] or ""
        for key in EDITABLE_TEXT:
            if key in data:
                p[key] = _text(data, key, 1000 if key == "description" else 100)
        if "tags" in data:
            p["tags"] = _tags(data["tags"])
        if "purchase_rate" in data:
            p["purchase_rate"] = f(_num(data["purchase_rate"], "Purchase rate"))
        if "selling_price" in data:
            p["selling_price"] = f(_num(data["selling_price"], "Selling price"))
        if "min_selling_price" in data:
            m = _num(data["min_selling_price"], "Minimum selling price", allow_none=True)
            p["min_selling_price"] = f(m) if m is not None else None
        if "discount_allowed_percent" in data:
            p["discount_allowed_percent"] = _num(data["discount_allowed_percent"], "Discount allowed", allow_none=True, maximum=100)
        if p.get("min_selling_price") is not None and p["min_selling_price"] > p["selling_price"]:
            raise ValidationFailed("Minimum selling price cannot be more than the selling price.")
        if "status" in data:
            if data["status"] not in ("active", "inactive"):
                raise ValidationFailed("Status must be active or inactive.")
            p["status"] = data["status"]
        codes = code_index(ctx)
        for field, what in (("sku", "SKU"), ("barcode", "Barcode")):
            if field in data and (data[field] or "").strip():
                new = _normalise_code(data[field], what)
                if new != p[field]:
                    owner = codes.get(new)
                    if owner and owner != p["id"]:
                        raise Conflict(f"The {what} '{new}' is already used by another product.")
                    changes.append(f"{field} {p[field]} -> {new}")
                    p[field] = new
        p["updated_at"] = now_iso()
        tx.put("products", p)
        if p["selling_price"] != old_price:
            changes.append(f"price {old_price} -> {p['selling_price']}")
        audit_service.record(tx, user, "PRODUCT_EDITED", "product", product_id,
                             f"Edited {p['sku']}" + (f" ({'; '.join(changes)})" if changes else ""))
    return present(ctx, ctx.store.get("products", product_id), user)


def delete_product(ctx: AppContext, user: dict, product_id: str) -> None:
    with ctx.store.transaction() as tx:
        p = tx.require("products", product_id, "Product")
        if inventory_service.total_stock(p) > 0:
            raise Conflict("This product still has stock. Reduce the stock to zero first "
                           "(use Adjust Stock - Damage / Lost / Other), then delete it.")
        p["status"] = "deleted"
        p["updated_at"] = now_iso()
        tx.put("products", p)
        audit_service.record(tx, user, "PRODUCT_DELETED", "product", product_id, f"Deleted {p['sku']} '{p['name']}'")


# ------------------------------------------------------------------ search
SORTS = {
    "newest": (lambda p: p["date_added"], True), "oldest": (lambda p: p["date_added"], False),
    "name": (lambda p: p["name"].lower(), False), "sku": (lambda p: p["sku"], False),
    "price_high": (lambda p: p["selling_price"], True), "price_low": (lambda p: p["selling_price"], False),
    "stock_high": (lambda p: inventory_service.total_stock(p), True),
    "stock_low": (lambda p: inventory_service.total_stock(p), False),
}


def search(ctx: AppContext, *, q: str = "", category_id: str = "", subcategory_id: str = "", vendor_id: str = "",
           location_id: str = "", stock_status: str = "", added_from: str = "", added_to: str = "",
           status: str = "", sort: str = "newest", sellable_only: bool = False) -> list[dict]:
    cfg = settings_service.get(ctx)["inventory"]
    blobs = _search_blob_index(ctx)
    terms = [t for t in (q or "").lower().split() if t]
    on = None
    out = []
    for p in ctx.store.all("products"):
        if p["status"] == "deleted":
            continue
        if status and p["status"] != status:
            continue
        if sellable_only and p["status"] != "active":
            continue
        if category_id and p["category_id"] != category_id:
            continue
        if subcategory_id and p.get("subcategory_id") != subcategory_id:
            continue
        if vendor_id and p.get("vendor_id") != vendor_id:
            continue
        qty = p["stock"].get(location_id, 0) if location_id else inventory_service.total_stock(p)
        if location_id and qty <= 0 and stock_status != "out_of_stock":
            continue
        if terms:
            blob = blobs[p["id"]]
            if not all(t in blob for t in terms):
                continue
        if stock_status == "in_stock" and qty <= 0:
            continue
        if stock_status == "out_of_stock" and inventory_service.total_stock(p) > 0:
            continue
        if stock_status == "low_stock" and not (0 < qty <= cfg["low_stock_threshold"]):
            continue
        if stock_status == "old_stock" and not (qty > 0 and product_age_days(p["date_added"], on) > cfg["old_stock_days"]):
            continue
        if (added_from or added_to) and not in_range(date_of(p["date_added"]), added_from or None, added_to or None):
            continue
        out.append(p)
    key, rev = SORTS.get(sort, SORTS["newest"])
    out.sort(key=key, reverse=rev)
    return out


def lookup_code(ctx: AppContext, code: str) -> dict:
    """Scanner / manual barcode lookup: exact SKU or barcode."""
    c = (code or "").strip().upper()
    if not c:
        raise ValidationFailed("Scan or type a barcode.")
    if not SKU_RE.match(c):
        raise ValidationFailed(f"'{code.strip()}' is not a valid barcode.")
    pid = code_index(ctx).get(c)
    p = ctx.store.get("products", pid) if pid else None
    if p is None or p["status"] == "deleted":
        raise NotFound(f"Unknown barcode '{c}'. No product has this code.")
    return p


# ------------------------------------------------------------------ images
def save_image(ctx: AppContext, user: dict, product_id: str, filename: str, content: bytes) -> dict:
    ext = Path(filename or "").suffix.lower()
    if ext not in IMAGE_EXTS:
        raise ValidationFailed("Product pictures must be JPG, PNG or WEBP files.")
    if not content:
        raise ValidationFailed("The picture file is empty.")
    if len(content) > MAX_IMAGE_BYTES:
        raise ValidationFailed("The picture is too big (maximum 6 MB).")
    try:
        img = Image.open(io.BytesIO(content))
        img.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationFailed("That file is not a valid picture.")
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    img.thumbnail((1200, 1200))
    with ctx.store.transaction() as tx:
        p = tx.require("products", product_id, "Product")
        rel = f"uploads/products/{p['sku']}.jpg"
        target = ctx.settings.uploads_dir / "products" / f"{p['sku']}.jpg"
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(".tmp")
        img.save(tmp, format="JPEG", quality=86, optimize=True)
        tmp.replace(target)
        p["image"] = rel
        p["image_version"] = int(p.get("image_version", 0)) + 1
        p["updated_at"] = now_iso()
        tx.put("products", p)
        audit_service.record(tx, user, "PRODUCT_EDITED", "product", product_id, f"Picture updated for {p['sku']}")
    return present(ctx, ctx.store.get("products", product_id), user)


def remove_image(ctx: AppContext, user: dict, product_id: str) -> dict:
    with ctx.store.transaction() as tx:
        p = tx.require("products", product_id, "Product")
        if p.get("image"):
            (ctx.settings.uploads_dir / "products" / Path(p["image"]).name).unlink(missing_ok=True)
        p["image"] = None
        p["updated_at"] = now_iso()
        tx.put("products", p)
        audit_service.record(tx, user, "PRODUCT_EDITED", "product", product_id, f"Picture removed from {p['sku']}")
    return present(ctx, ctx.store.get("products", product_id), user)


# ------------------------------------------------------------------ detail page
def detail(ctx: AppContext, user: dict, product_id: str) -> dict:
    p = ctx.store.get("products", product_id)
    if p is None or p["status"] == "deleted":
        raise NotFound("Product not found.")
    out = present(ctx, p, user)
    txns = [t for t in reversed(ctx.store.all("inventory_transactions")) if t["product_id"] == product_id][:100]
    sales = []
    for s in reversed(ctx.store.all("sales")):
        for it in s["items"]:
            if it["product_id"] == product_id:
                sales.append({"sale_id": s["id"], "invoice_number": s["invoice_number"], "date_time": s["date_time"],
                              "status": s["status"], "quantity": it["quantity"], "unit_price": it["unit_price"],
                              "line_total": it["line_total"], "cashier_name": s.get("cashier_name", "")})
        if len(sales) >= 100:
            break
    out["inventory_history"] = txns
    out["sales_history"] = sales
    if can_see_cost(user):
        rows = []
        for pur in reversed(ctx.store.all("purchases")):
            for it in pur["items"]:
                if it["product_id"] == product_id:
                    rows.append({"purchase_id": pur["id"], "purchase_date": pur["purchase_date"],
                                 "vendor_name": pur.get("vendor_name", ""), "invoice_number": pur.get("invoice_number", ""),
                                 "quantity": it["quantity"], "rate": it["rate"], "total": it["total"]})
        out["purchase_history"] = rows
        out["total_purchase_value"] = f(sum(D(r["total"]) for r in rows))
    return out
