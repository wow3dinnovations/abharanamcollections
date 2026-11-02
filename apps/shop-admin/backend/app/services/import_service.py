"""Excel / CSV product import:  upload -> preview -> map columns -> validate -> confirm -> save.

Nothing is saved unless EVERY row is valid (no silent partial imports).  Problems are returned row by row and
can be downloaded as an Excel error report.
"""
from __future__ import annotations

import csv
import io
import re
import secrets
from datetime import date, datetime
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

from app.core.context import AppContext
from app.core.errors import AppError, NotFound, ValidationFailed
from app.services import audit_service, inventory_service, product_service
from app.utils.dates import now_iso, today_iso
from app.utils.money import D, dsum, f

MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 20000
ID_RE = re.compile(r"^[a-f0-9]{16}$")

# key, label, required, hint, header words used to guess the mapping
FIELDS = [
    ("name", "Product name", True, "e.g. Gold Finish Jhumka", ["name", "product", "product name", "item"]),
    ("category", "Category", True, "must already exist", ["category", "type"]),
    ("selling_price", "Selling price", True, "in rupees", ["selling price", "price", "mrp", "sale price", "rate"]),
    ("sku", "SKU / Product code", False, "blank = auto-create", ["sku", "code", "product code", "item code"]),
    ("barcode", "Barcode", False, "blank = same as SKU", ["barcode", "bar code"]),
    ("subcategory", "Sub-category", False, "must already exist", ["subcategory", "sub category", "sub-category"]),
    ("description", "Description", False, "", ["description", "details"]),
    ("design_number", "Design number", False, "", ["design", "design number", "design no"]),
    ("size", "Size", False, "", ["size"]),
    ("colour", "Colour", False, "", ["colour", "color"]),
    ("material", "Material", False, "", ["material"]),
    ("collection", "Collection", False, "", ["collection"]),
    ("tags", "Tags", False, "separate with commas", ["tags", "tag"]),
    ("vendor", "Vendor", False, "must already exist", ["vendor", "supplier", "seller"]),
    ("location", "Location", False, "must already exist (needed when quantity is above 0)", ["location", "store", "shop"]),
    ("purchase_date", "Purchase date", False, "YYYY-MM-DD or DD/MM/YYYY", ["purchase date", "date"]),
    ("purchase_invoice_no", "Purchase invoice no.", False, "", ["invoice", "invoice no", "purchase invoice"]),
    ("purchase_rate", "Purchase rate", False, "cost price each", ["purchase rate", "cost", "cost price", "purchase price"]),
    ("quantity", "Quantity", False, "pieces in stock now", ["quantity", "qty", "stock", "pieces"]),
    ("discount_allowed_percent", "Discount allowed %", False, "", ["discount allowed", "max discount"]),
    ("min_selling_price", "Minimum selling price", False, "", ["minimum price", "min price", "min selling price"]),
    ("rack", "Rack / Shelf / Bin", False, "", ["rack", "shelf", "bin"]),
]
FIELD_KEYS = [x[0] for x in FIELDS]


# ------------------------------------------------------------------ reading files
def _norm(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(h or "").lower()).strip()


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def _read(path: Path) -> tuple[list[str], list[list[str]]]:
    ext = path.suffix.lower()
    if ext == ".csv":
        text = path.read_bytes().decode("utf-8-sig", errors="replace")
        rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text))]
    else:
        try:
            wb = load_workbook(path, read_only=True, data_only=True)
        except Exception:
            raise ValidationFailed("That file cannot be read as an Excel file. Please save it as .xlsx and try again.")
        ws = wb.worksheets[0]
        rows = [[_cell(c) for c in r] for r in ws.iter_rows(values_only=True)]
        wb.close()
    rows = [r for r in rows if any(c != "" for c in r)]
    if not rows:
        raise ValidationFailed("The file is empty.")
    header = [h or f"Column {i + 1}" for i, h in enumerate(rows[0])]
    body = rows[1:]
    if len(body) > MAX_ROWS:
        raise ValidationFailed(f"The file has {len(body)} rows. Please import at most {MAX_ROWS} at a time.")
    width = len(header)
    return header, [(r + [""] * width)[:width] for r in body]


def _path(ctx: AppContext, import_id: str) -> Path:
    if not ID_RE.match(import_id or ""):
        raise ValidationFailed("Invalid import.")
    for ext in (".xlsx", ".csv"):
        p = ctx.settings.uploads_dir / "imports" / f"{import_id}{ext}"
        if p.exists():
            return p
    raise NotFound("That import was not found. Please upload the file again.")


def suggest_mapping(header: list[str]) -> dict[str, str]:
    norm = {_norm(h): h for h in header}
    out: dict[str, str] = {}
    used: set[str] = set()
    for key, label, _, _, words in FIELDS:
        for cand in [_norm(label)] + words:
            if cand in norm and norm[cand] not in used:
                out[key] = norm[cand]
                used.add(norm[cand])
                break
    return out


# ------------------------------------------------------------------ step 1: upload + preview
def preview(ctx: AppContext, filename: str, content: bytes) -> dict:
    ext = Path(filename or "").suffix.lower()
    if ext not in (".xlsx", ".csv"):
        raise ValidationFailed("Please choose an Excel (.xlsx) or CSV (.csv) file.")
    if not content or len(content) > MAX_BYTES:
        raise ValidationFailed("The file is empty or too big (maximum 8 MB).")
    import_id = secrets.token_hex(8)
    folder = ctx.settings.uploads_dir / "imports"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{import_id}{ext}"
    path.write_bytes(content)
    try:
        header, rows = _read(path)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    # tidy up old uploads (older than a day)
    for old in folder.glob("*"):
        if old.is_file() and old.name != ".gitkeep" and datetime.now().timestamp() - old.stat().st_mtime > 86400:
            old.unlink(missing_ok=True)
    return {"import_id": import_id, "filename": Path(filename).name, "headers": header, "sample_rows": rows[:8], "row_count": len(rows),
            "suggested_mapping": suggest_mapping(header),
            "fields": [{"key": k, "label": l, "required": r, "hint": h} for k, l, r, h, _ in FIELDS]}


# ------------------------------------------------------------------ step 2/3: validate / commit
class _DryRun(Exception):
    pass


def _find(tx, collection: str, name: str, extra=None) -> dict | None:
    key = name.strip().lower()
    for r in tx.iter_all(collection):
        if r["name"].strip().lower() == key and (extra is None or extra(r)):
            return r
    return None


def _process(ctx: AppContext, user: dict, import_id: str, mapping: dict, commit: bool) -> dict:
    path = _path(ctx, import_id)
    header, rows = _read(path)
    for key, col in mapping.items():
        if key not in FIELD_KEYS:
            raise ValidationFailed(f"Unknown field '{key}'.")
        if col and col not in header:
            raise ValidationFailed(f"Column '{col}' is not in the file.")
    missing = [l for k, l, req, _, _ in FIELDS if req and not mapping.get(k)]
    if missing:
        raise ValidationFailed(f"Please choose a column for: {', '.join(missing)}.")
    idx = {k: header.index(c) for k, c in mapping.items() if c}

    errors: list[dict] = []
    built: list[tuple[int, dict, int]] = []
    preview_rows: list[dict] = []
    created_ids: list[str] = []

    def err(row_no: int, field: str, msg: str):
        errors.append({"row": row_no, "field": field, "message": msg})

    try:
        with ctx.store.transaction() as tx:
            taken: set[str] = set()
            cat_cache: dict[str, dict | None] = {}
            for i, raw in enumerate(rows):
                row_no = i + 2                                       # spreadsheet row number (row 1 = header)
                get = lambda k: raw[idx[k]].strip() if k in idx else ""      # noqa: E731
                data = {k: get(k) for k in FIELD_KEYS if k in idx}
                bad = False
                cat = None
                if not data.get("name"):
                    err(row_no, "name", "Product name is missing"); bad = True
                if not data.get("category"):
                    err(row_no, "category", "Category is missing"); bad = True
                else:
                    ck = data["category"].lower()
                    if ck not in cat_cache:
                        cat_cache[ck] = _find(tx, "categories", data["category"])
                    cat = cat_cache[ck]
                    if cat is None:
                        err(row_no, "category", f"Category '{data['category']}' does not exist"); bad = True
                    elif not cat.get("active", True):
                        err(row_no, "category", f"Category '{data['category']}' is inactive"); bad = True
                    else:
                        data["category_id"] = cat["id"]
                if not data.get("selling_price"):
                    err(row_no, "selling_price", "Selling price is missing"); bad = True
                if data.get("subcategory") and cat:
                    sub = _find(tx, "subcategories", data["subcategory"], lambda r: r["category_id"] == cat["id"])
                    if sub is None:
                        err(row_no, "subcategory", f"Sub-category '{data['subcategory']}' does not exist in {cat['name']}"); bad = True
                    else:
                        data["subcategory_id"] = sub["id"]
                if data.get("vendor"):
                    v = _find(tx, "vendors", data["vendor"])
                    if v is None:
                        err(row_no, "vendor", f"Vendor '{data['vendor']}' does not exist"); bad = True
                    else:
                        data["vendor_id"] = v["id"]
                qty_text = data.get("quantity", "")
                qty = 0
                if qty_text:
                    try:
                        qf = float(qty_text)
                        if qf != int(qf) or qf < 0:
                            raise ValueError
                        qty = int(qf)
                    except ValueError:
                        err(row_no, "quantity", f"Quantity '{qty_text}' must be a whole number, 0 or more"); bad = True
                if data.get("location"):
                    loc = _find(tx, "locations", data["location"])
                    if loc is None:
                        err(row_no, "location", f"Location '{data['location']}' does not exist"); bad = True
                    elif not loc.get("active", True):
                        err(row_no, "location", f"Location '{data['location']}' is inactive"); bad = True
                    else:
                        data["purchase_location_id"] = loc["id"]
                elif qty > 0:
                    err(row_no, "location", "Location is needed when the quantity is above 0"); bad = True
                data["initial_quantity"] = qty
                if data.get("purchase_date"):
                    try:
                        from app.utils.dates import parse_date
                        data["purchase_date"] = parse_date(data["purchase_date"]).isoformat()
                    except AppError:
                        err(row_no, "purchase_date", f"Date '{data['purchase_date']}' is not valid"); bad = True
                data = {k: v for k, v in data.items() if v != ""}          # blank cells simply use the defaults
                if bad:
                    continue
                try:
                    product, opening = product_service.build_product(ctx, tx, user, data, taken_codes=taken)
                except AppError as e:
                    low = e.message.lower()
                    field = ("sku" if "SKU" in e.message else "barcode" if "Barcode" in e.message else "selling_price" if "selling price" in low
                             else "purchase_rate" if "purchase rate" in low else "quantity" if "quantity" in low else "row")
                    err(row_no, field, e.message)
                    continue
                tx.insert("products", product)
                built.append((row_no, product, opening))
                if len(preview_rows) < 10:
                    preview_rows.append({"row": row_no, "sku": product["sku"], "name": product["name"], "category": data["category"],
                                         "selling_price": product["selling_price"], "quantity": opening})
            if len(rows) == 0:
                errors.append({"row": 0, "field": "file", "message": "The file has no data rows"})

            if commit and not errors:
                # stock is added through ONE purchase per vendor / location / date, so history and reports stay correct
                groups: dict[tuple, list[tuple[dict, int]]] = {}
                for _, product, opening in built:
                    if opening > 0:
                        groups.setdefault((product.get("vendor_id", ""), product["purchase_location_id"], product["purchase_date"]), []).append((product, opening))
                for (vendor_id, loc_id, pdate), items in groups.items():
                    vendor = tx.get("vendors", vendor_id) if vendor_id else None
                    pid = tx.next_id("PUR", 6)
                    lines = []
                    for product, opening in items:
                        inventory_service.change_stock(tx, product, loc_id, opening, "PURCHASE", user, "purchase", pid, "Opening stock (Excel import)")
                        tx.put("products", product)
                        lines.append({"product_id": product["id"], "sku": product["sku"], "name": product["name"], "quantity": opening,
                                      "rate": product["purchase_rate"], "total": f(D(product["purchase_rate"]) * opening)})
                    tx.insert("purchases", {"id": pid, "vendor_id": vendor_id, "vendor_name": vendor["name"] if vendor else "", "location_id": loc_id,
                                            "purchase_date": pdate, "invoice_number": items[0][0].get("purchase_invoice_no", ""),
                                            "notes": "Created by Excel import", "source": "import", "items": lines, "total": f(dsum(l["total"] for l in lines)),
                                            "created_by": user["id"], "created_by_name": user["username"], "created_at": now_iso(), "updated_at": now_iso()})
                created_ids = [p["id"] for _, p, _ in built]
                audit_service.record(tx, user, "DATA_IMPORTED", "products", import_id, f"Imported {len(built)} products from {path.name}")
            else:
                raise _DryRun()
    except _DryRun:
        pass
    return {"valid_rows": len(built), "error_count": len(errors), "errors": errors[:500], "total_rows": len(rows),
            "preview": preview_rows, "created": len(created_ids), "created_ids": created_ids}


def validate(ctx: AppContext, user: dict, import_id: str, mapping: dict) -> dict:
    return _process(ctx, user, import_id, mapping, commit=False)


def commit(ctx: AppContext, user: dict, import_id: str, mapping: dict) -> dict:
    result = _process(ctx, user, import_id, mapping, commit=False)          # check first, save nothing
    if result["error_count"]:
        raise AppError(f"{result['error_count']} problem(s) found. Nothing was imported. Fix the file and try again.",
                       status_code=422, code="IMPORT_HAS_ERRORS", extra={"errors": result["errors"], "error_count": result["error_count"]})
    ctx.backups.create("pre-import", f"Automatic backup before importing {result['valid_rows']} products", user.get("username", ""))
    done = _process(ctx, user, import_id, mapping, commit=True)
    if done["error_count"]:      # cannot normally happen (same data), but never save a half import
        raise AppError("The import could not be completed. Nothing was imported.", status_code=422, code="IMPORT_HAS_ERRORS", extra={"errors": done["errors"]})
    _path(ctx, import_id).unlink(missing_ok=True)
    return done


# ------------------------------------------------------------------ files for the user
def error_report(errors: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Import errors"
    ws.append(["Row in your file", "Field", "Problem"])
    for c in ws[1]:
        c.font = Font(bold=True, color="F5ECC9")
        c.fill = PatternFill("solid", fgColor="5A1024")
    for e in errors:
        ws.append([e["row"], e["field"], e["message"]])
    ws.column_dimensions["A"].width = 16
    ws.column_dimensions["B"].width = 18
    ws.column_dimensions["C"].width = 90
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:C{max(len(errors) + 1, 2)}"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def template() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Products"
    ws.append([l for _, l, _, _, _ in FIELDS])
    ws.append(["Gold Finish Jhumka", "Jhumkas", 799, "", "", "", "Antique style jhumka", "D-101", "Medium", "Gold", "Brass", "Festive", "festive, jhumka",
               "Test Vendor", "Nandyal", today_iso(), "INV-001", 350, 10, "", "", "A1"])
    for c in ws[1]:
        c.font = Font(bold=True, color="F5ECC9")
        c.fill = PatternFill("solid", fgColor="5A1024")
        c.alignment = Alignment(wrap_text=True, vertical="center")
    for i in range(1, len(FIELDS) + 1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = 20
    ws.freeze_panes = "A2"
    guide = wb.create_sheet("How to fill")
    guide.append(["Column", "Required?", "Notes"])
    for _, label, req, hint, _ in FIELDS:
        guide.append([label, "YES" if req else "no", hint])
    guide.append([])
    guide.append(["Category, Sub-category, Vendor and Location names must match what is already in the software (add them first under Administration / Purchases)."])
    guide.column_dimensions["A"].width = 28
    guide.column_dimensions["C"].width = 70
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
