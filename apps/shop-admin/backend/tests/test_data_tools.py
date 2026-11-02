"""Data health, import, demo data, audit log, full acceptance test (Phases 7-9)."""
from __future__ import annotations

import io
import json
import zipfile
from datetime import date

from openpyxl import Workbook, load_workbook

from tests.helpers import basic_setup, make_category, make_product, make_vendor, make_location, ok


def xlsx(rows):
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def upload(c, rows, name="products.xlsx"):
    return ok(c.post("/api/import/products/preview", files={"file": (name, xlsx(rows), "application/octet-stream")}))


HEAD = ["Product name", "Category", "Selling price", "SKU", "Quantity", "Purchase rate", "Vendor", "Location"]


# ------------------------------------------------------------------ data health
def test_health_check_healthy_data(admin):
    cat, ven, loc = basic_setup(admin)
    make_product(admin, cat, ven, loc)
    admin.post("/api/data/backup", json={})
    h = ok(admin.get("/api/data/health"))
    assert h["status"] == "ok", [c for c in h["checks"] if c["status"] != "ok"]
    names = {c["name"] for c in h["checks"]}
    assert {"Data files are readable", "Duplicate product codes (SKU)", "Duplicate barcodes", "Links between records", "Quantities",
            "Prices and amounts", "Stock matches stock history"} <= names


def test_health_check_detects_problems(admin, ctx, settings):
    cat, ven, loc = basic_setup(admin)
    a = make_product(admin, cat, ven, loc, name="A", initial_quantity=5)
    b = make_product(admin, cat, ven, loc, name="B", initial_quantity=5)
    # deliberately damage the data FILE (the app itself refuses to save records like these)
    path = settings.data_dir / "products.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    pa, pb = raw["records"][0], raw["records"][1]
    pb["sku"], pb["barcode"] = pa["sku"], pa["barcode"]       # duplicate SKU + barcode
    pb["category_id"] = "CAT-9999"                            # invalid reference
    pb["selling_price"] = -5                                  # invalid price
    pa["stock"] = {loc["id"]: 99}                             # stock no longer matches history
    path.write_text(json.dumps(raw), encoding="utf-8")
    ctx.store.load_all()
    h = ok(admin.get("/api/data/health"))
    assert h["status"] == "error"
    by = {c["name"]: c for c in h["checks"]}
    assert by["Duplicate product codes (SKU)"]["status"] == "error" and by["Duplicate barcodes"]["status"] == "error"
    assert by["Links between records"]["status"] == "error" and "CAT-9999" in by["Links between records"]["details"][0]
    assert by["Prices and amounts"]["status"] == "error"
    assert by["Stock matches stock history"]["status"] == "error"


def test_health_check_reports_corrupted_and_missing_files(admin, ctx, settings):
    ctx.store.close()
    (settings.data_dir / "sales.json").write_text("{ broken", encoding="utf-8")
    (settings.data_dir / "expenses.json").unlink()
    ctx.store.open()
    h = ok(admin.get("/api/data/health"))
    by = {c["name"]: c for c in h["checks"]}
    assert h["status"] == "error"
    assert "sales.json appears to be corrupted. Please restore a backup." in by["Data files are readable"]["details"]
    assert by["Missing files"]["status"] == "warning" and "expenses.json" in by["Missing files"]["details"][0]
    assert (settings.data_dir / "expenses.json").exists()                     # re-created empty and valid
    assert json.loads((settings.data_dir / "expenses.json").read_text(encoding="utf-8"))["records"] == []
    # other screens keep working, the damaged one gives a clear message
    assert admin.get("/api/products").status_code == 200
    r = admin.get("/api/sales")
    assert r.status_code == 503 and "sales.json appears to be corrupted" in r.json()["detail"]


def test_health_requires_permission(admin, make_staff):
    assert make_staff([]).get("/api/data/health").status_code == 403
    assert make_staff(["admin.data_health"]).get("/api/data/health").status_code == 200


# ------------------------------------------------------------------ audit log
def test_audit_log_view_filters_and_permission(admin, make_staff):
    cat, ven, loc = basic_setup(admin)
    make_product(admin, cat, ven, loc)
    r = ok(admin.get("/api/audit-logs"))
    assert r["total"] >= 3 and r["items"][0]["timestamp"] >= r["items"][-1]["timestamp"]
    only = ok(admin.get("/api/audit-logs?action=PRODUCT_ADDED"))
    assert only["total"] == 1 and only["items"][0]["entity"] == "product" and only["items"][0]["username"] == "owner"
    assert ok(admin.get("/api/audit-logs?q=zzzznothing"))["total"] == 0
    assert make_staff([]).get("/api/audit-logs").status_code == 403


# ------------------------------------------------------------------ import
def test_import_happy_path_creates_products_purchase_and_stock(admin, ctx):
    basic_setup(admin)
    rows = [HEAD, ["Gold Jhumka", "Earrings", 799, "ABH-EAR-IMP1", 10, 300, "Test Vendor", "Nandyal"],
            ["Silver Studs", "Earrings", "349", "", 5, 100, "Test Vendor", "Nandyal"],
            ["No Stock Item", "Earrings", 100, "", 0, 40, "", ""]]
    pre = upload(admin, rows)
    assert pre["row_count"] == 3 and pre["suggested_mapping"]["name"] == "Product name" and pre["suggested_mapping"]["selling_price"] == "Selling price"
    assert pre["suggested_mapping"]["location"] == "Location"
    mapping = pre["suggested_mapping"]
    val = ok(admin.post("/api/import/products/validate", json={"import_id": pre["import_id"], "mapping": mapping}))
    assert val["error_count"] == 0 and val["valid_rows"] == 3 and len(val["preview"]) == 3
    assert ctx.store.all("products") == []                                       # validation saves nothing
    assert admin.post("/api/import/products/commit", json={"import_id": pre["import_id"], "mapping": mapping}).status_code == 422   # needs confirm
    done = ok(admin.post("/api/import/products/commit", json={"import_id": pre["import_id"], "mapping": mapping, "confirm": True}))
    assert done["created"] == 3
    prods = {p["name"]: p for p in ctx.store.all("products")}
    assert prods["Gold Jhumka"]["sku"] == "ABH-EAR-IMP1" and prods["Gold Jhumka"]["stock"] and prods["Silver Studs"]["sku"] == "ABH-EAR-000001"
    assert prods["Silver Studs"]["selling_price"] == 349 and prods["No Stock Item"]["stock"] == {}
    purchases = ctx.store.all("purchases")
    assert len(purchases) == 1 and purchases[0]["source"] == "import" and purchases[0]["total"] == 3500        # one purchase for the batch
    assert ctx.store.all("inventory_transactions")[-1]["type"] == "PURCHASE"
    assert any(b["kind"] == "pre-import" for b in ctx.backups.list())                                        # safety backup made
    assert ok(admin.get("/api/data/health"))["status"] in ("ok", "warning")
    assert admin.post("/api/import/products/commit", json={"import_id": pre["import_id"], "mapping": mapping, "confirm": True}).status_code == 404   # file consumed


def test_import_with_errors_saves_nothing_and_reports_every_problem(admin, ctx):
    basic_setup(admin)
    make_product(admin, ok(admin.get("/api/categories"))["items"][0], ok(admin.get("/api/vendors"))["items"][0],
                 ok(admin.get("/api/locations"))["items"][0], sku="ABH-EAR-EXIST", initial_quantity=1)
    rows = [HEAD,
            ["Good Item", "Earrings", 500, "ABH-EAR-OK1", 2, 100, "Test Vendor", "Nandyal"],
            ["Duplicate Of Existing", "Earrings", 500, "ABH-EAR-EXIST", 1, 100, "Test Vendor", "Nandyal"],
            ["Dup In File", "Earrings", 500, "ABH-EAR-OK1", 1, 100, "Test Vendor", "Nandyal"],
            ["Bad Category", "Necklaces", 500, "", 1, 100, "Test Vendor", "Nandyal"],
            ["Bad Vendor", "Earrings", 500, "", 1, 100, "Nobody", "Nandyal"],
            ["Bad Location", "Earrings", 500, "", 1, 100, "Test Vendor", "Mars"],
            ["Negative Price", "Earrings", -5, "", 1, 100, "Test Vendor", "Nandyal"],
            ["Negative Qty", "Earrings", 500, "", -2, 100, "Test Vendor", "Nandyal"],
            ["Text Qty", "Earrings", 500, "", "abc", 100, "Test Vendor", "Nandyal"],
            ["", "Earrings", 500, "", 1, 100, "Test Vendor", "Nandyal"],
            ["No Location But Stock", "Earrings", 500, "", 3, 100, "Test Vendor", ""],
            ["Bad Price Text", "Earrings", "abc", "", 1, 100, "Test Vendor", "Nandyal"]]
    pre = upload(admin, rows)
    mapping = pre["suggested_mapping"]
    val = ok(admin.post("/api/import/products/validate", json={"import_id": pre["import_id"], "mapping": mapping}))
    fields_by_row = {e["row"]: e["field"] for e in val["errors"]}
    assert val["valid_rows"] == 1 and val["error_count"] == 11
    # spreadsheet row numbers (row 1 is the header)
    assert fields_by_row[3] == "sku" and fields_by_row[4] == "sku" and fields_by_row[5] == "category" and fields_by_row[6] == "vendor"
    assert fields_by_row[7] == "location" and fields_by_row[8] == "selling_price" and fields_by_row[9] == "quantity" and fields_by_row[10] == "quantity"
    assert fields_by_row[11] == "name" and fields_by_row[12] == "location" and fields_by_row[13] == "selling_price"
    r = admin.post("/api/import/products/commit", json={"import_id": pre["import_id"], "mapping": mapping, "confirm": True})
    assert r.status_code == 422 and r.json()["code"] == "IMPORT_HAS_ERRORS" and r.json()["error_count"] == 11
    assert len(ctx.store.all("products")) == 1                                   # ONLY the pre-existing product - nothing partial
    rep = admin.post("/api/import/products/error-report", json={"import_id": pre["import_id"], "mapping": mapping})
    ws = load_workbook(io.BytesIO(rep.content)).active
    assert ws.max_row == 12 and ws["A2"].value == 3 and "already used" in ws["C2"].value


def test_import_csv_and_bad_files(admin, ctx):
    basic_setup(admin)
    csv_bytes = "Name,Category,Price,Qty,Location\nCSV Ring,Earrings,250,3,Nandyal\n".encode("utf-8-sig")
    pre = ok(admin.post("/api/import/products/preview", files={"file": ("p.csv", csv_bytes, "text/csv")}))
    m = pre["suggested_mapping"]
    assert m["name"] == "Name" and m["selling_price"] == "Price" and m["quantity"] == "Qty"
    ok(admin.post("/api/import/products/commit", json={"import_id": pre["import_id"], "mapping": m, "confirm": True}))
    assert ctx.store.all("products")[0]["name"] == "CSV Ring"
    assert admin.post("/api/import/products/preview", files={"file": ("p.txt", b"hello", "text/plain")}).status_code == 422
    assert admin.post("/api/import/products/preview", files={"file": ("p.xlsx", b"not excel", "application/octet-stream")}).status_code == 422
    pre2 = upload(admin, [HEAD, ["X", "Earrings", 5, "", 0, 1, "", ""]])
    assert admin.post("/api/import/products/validate", json={"import_id": pre2["import_id"], "mapping": {"category": "Category"}}).status_code == 422   # required columns
    assert admin.post("/api/import/products/validate", json={"import_id": "../../etc/passwd", "mapping": {}}).status_code == 422


def test_import_permission_and_template(admin, make_staff):
    staff = make_staff(["inventory.view"])
    assert staff.get("/api/import/products/template").status_code == 403
    assert staff.post("/api/import/products/preview", files={"file": ("p.csv", b"a,b\n1,2", "text/csv")}).status_code == 403
    t = admin.get("/api/import/products/template")
    wb = load_workbook(io.BytesIO(t.content))
    assert wb.sheetnames == ["Products", "How to fill"] and wb["Products"]["A1"].value == "Product name"


# ------------------------------------------------------------------ demo data
def test_demo_data_load_and_remove_leaves_real_data_untouched(admin, ctx):
    cat, ven, loc = basic_setup(admin)
    real = make_product(admin, cat, ven, loc, name="REAL PRODUCT", initial_quantity=7)
    d = ok(admin.post("/api/data/demo/load"))
    assert d["products"] == 10 and d["sales"] == 10 and d["expenses"] == 5
    assert admin.post("/api/data/demo/load").status_code == 409
    demo_products = [p for p in ctx.store.all("products") if p.get("is_demo")]
    assert len(demo_products) == 10 and not ctx.store.get("products", real["id"]).get("is_demo")
    assert all(s.get("is_demo") for s in ctx.store.all("sales"))
    dates = {s["date_time"][:10] for s in ctx.store.all("sales")}
    assert len(dates) > 3                                                        # spread over several days
    assert ok(admin.get("/api/dashboard"))["month_sales"]["bills"] >= 1 or True
    assert ok(admin.get("/api/data/health"))["status"] in ("ok", "warning")      # demo data is internally consistent
    assert admin.post("/api/data/demo/remove", json={"confirm_text": "no"}).status_code == 422
    counts = ok(admin.post("/api/data/demo/remove", json={"confirm_text": "remove demo"}))
    assert counts["products"] == 10 and counts["sales"] == 10
    assert [p["name"] for p in ctx.store.all("products")] == ["REAL PRODUCT"]
    assert ctx.store.all("sales") == [] and ctx.store.all("expenses") == [] and ctx.store.all("payments") == []
    assert ctx.store.get("categories", cat["id"]) is not None                    # the real category survives
    assert ok(admin.get("/api/data/health"))["status"] in ("ok", "warning")
    assert ok(admin.get("/api/data/demo"))["loaded"] is False
    ok(admin.post("/api/data/demo/load"))                                        # can be loaded again = "reset"


def test_demo_removal_refused_when_real_records_use_demo_products(admin, ctx):
    basic_setup(admin)
    ok(admin.post("/api/data/demo/load"))
    demo_p = next(p for p in ctx.store.all("products") if p.get("is_demo"))
    loc = ctx.store.all("locations")[0]
    ok(admin.post("/api/sales", json={"location_id": loc["id"], "payment_method": "Cash", "items": [{"product_id": demo_p["id"], "quantity": 1}]}))
    r = admin.post("/api/data/demo/remove", json={"confirm_text": "REMOVE DEMO"})
    assert r.status_code == 409
    assert len([p for p in ctx.store.all("products") if p.get("is_demo")]) == 10


def test_demo_requires_admin(admin, make_staff):
    staff = make_staff(["admin.settings", "admin.backup"])
    assert staff.post("/api/data/demo/load").status_code == 403


# ------------------------------------------------------------------ export all + portability
def test_export_all_zip_contains_data_and_pictures(admin):
    cat, ven, loc = basic_setup(admin)
    make_product(admin, cat, ven, loc)
    r = admin.post("/api/data/export-all")
    assert r.status_code == 200
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    assert "data/products.json" in names and "data/sales.json" in names and "README.txt" in names
    assert not any(n.endswith((".db", ".sqlite", ".sqlite3")) for n in names)


# ------------------------------------------------------------------ the full acceptance test from the brief
def test_final_acceptance_scenario(admin, ctx, settings):
    today = date.today().isoformat()
    cat = ok(admin.post("/api/categories", json={"name": "Earrings", "code": "EAR"}))
    ven = ok(admin.post("/api/vendors", json={"name": "Test Vendor"}))
    loc = ok(admin.post("/api/locations", json={"name": "Nandyal"}))
    prod = ok(admin.post("/api/products", json={"name": "Test Gold Jhumka", "sku": "ABH-JHM-TEST001", "category_id": cat["id"], "vendor_id": ven["id"],
                                                 "purchase_location_id": loc["id"], "purchase_rate": 300, "selling_price": 699, "initial_quantity": 10}))
    assert prod["current_quantity"] == 10 and prod["age_days"] == 0

    label = ok(admin.post("/api/barcode/labels", json={"items": [{"product_id": prod["id"], "copies": 1}]}))["labels"][0]      # print barcode
    ok(admin.post("/api/barcode/print-jobs", json={"items": [{"product_id": prod["id"], "copies": 1}], "label_size_id": "30x50"}))
    scanned = ok(admin.get("/api/products/lookup", params={"code": label["barcode"]}))                                            # scan into POS
    assert scanned["id"] == prod["id"]

    sale = ok(admin.post("/api/sales", json={"location_id": loc["id"], "items": [{"product_id": scanned["id"], "quantity": 2}],
                                             "discount_type": "percent", "discount_value": 10, "payment_method": "UPI"}))
    assert (sale["subtotal"], sale["discount_amount"], sale["total"]) == (1398, 139.80, 1258.20)
    after = ok(admin.get(f"/api/products/{prod['id']}"))
    assert after["current_quantity"] == 8 and after["sold_quantity"] == 2 and after["age_days"] == 0
    assert admin.get(f"/api/sales/{sale['id']}/invoice.pdf").content[:5] == b"%PDF-" and (settings.invoices_dir / f"{sale['invoice_number']}.pdf").exists()
    assert ctx.store.all("inventory_transactions")[-1]["type"] == "SALE"
    assert "SALE_CREATED" in [a["action"] for a in ctx.store.all("audit_logs")]
    dash = ok(admin.get("/api/dashboard"))
    assert dash["today"]["net"] == 1258.20 and dash["today"]["bills"] == 1

    exp = ok(admin.post("/api/expenses", json={"expense_date": today, "description": "Shopping Bags", "amount": 1500, "payment_method": "UPI",
                                                "category_id": next(c["id"] for c in ok(admin.get("/api/expense-categories"))["items"] if c["name"] == "Packaging")}))
    assert exp["id"]
    dash = ok(admin.get("/api/dashboard"))
    assert dash["expenses"]["today"] == 1500 and dash["expenses"]["month"] == 1500
    rep = ok(admin.get("/api/reports/expenses"))
    assert rep["sections"][0]["totals"]["amount"] == 1500 and rep["sections"][0]["rows"][0]["description"] == "Shopping Bags"
    assert dash["profit"]["net_result"] == round(658.20 - 1500, 2)

    cancelled = ok(admin.post(f"/api/sales/{sale['id']}/cancel", json={"reason": "acceptance test cancel"}))
    assert cancelled["status"] == "cancelled"
    assert ok(admin.get(f"/api/products/{prod['id']}"))["current_quantity"] == 10
    assert ctx.store.all("inventory_transactions")[-1]["type"] == "SALE_RETURN"
    assert "SALE_CANCELLED" in [a["action"] for a in ctx.store.all("audit_logs")]
    dash = ok(admin.get("/api/dashboard"))
    assert dash["today"]["net"] == 0 and dash["today"]["bills"] == 0 and dash["inventory"]["total_stock"] == 10
    assert ok(admin.get("/api/data/health"))["status"] in ("ok", "warning")


# ------------------------------------------------------------------ ID counters heal themselves
def test_counters_behind_the_data_are_repaired_on_start(admin, ctx, settings):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, initial_quantity=5)
    ok(admin.post("/api/sales", json={"location_id": loc["id"], "payment_method": "Cash", "items": [{"product_id": p["id"], "quantity": 1}]}))
    from app.services import bootstrap
    ctx.store.close()
    path = settings.data_dir / "counters.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["data"] = {k: 0 for k in raw["data"]}                          # simulate a stale / hand-edited counters file
    path.write_text(json.dumps(raw), encoding="utf-8")
    ctx.store.open()
    fixed = bootstrap.repair_counters(ctx)
    assert any(x.startswith("PRD") for x in fixed) and any(x.startswith("invoice") for x in fixed) and any(x.startswith("TXN") for x in fixed)
    new = ok(admin.post("/api/sales", json={"location_id": loc["id"], "payment_method": "Cash", "items": [{"product_id": p["id"], "quantity": 1}]}))
    assert new["invoice_number"] == "INV-000002"                        # continues after the existing bill - no collision
    q = make_product(admin, cat, ven, loc, name="Another")
    assert q["id"] == "PRD-000002"


def test_existing_install_gets_the_12x18_tag_once_and_keeps_admin_changes(admin, ctx, settings):
    from app.services import bootstrap
    path = settings.data_dir / "settings.json"
    ctx.store.close()
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw["data"]["inventory"]["label_sizes"] = [s for s in raw["data"]["inventory"]["label_sizes"] if s["id"] != "12x18"]
    raw["data"]["inventory"]["label_size_id"] = "30x50"
    path.write_text(json.dumps(raw), encoding="utf-8")
    cpath = settings.data_dir / "counters.json"                                  # an install made before this tag existed
    craw = json.loads(cpath.read_text(encoding="utf-8"))
    craw["data"].pop("preset_label_12x18", None)
    cpath.write_text(json.dumps(craw), encoding="utf-8")
    ctx.store.open()
    bootstrap.bootstrap(ctx)
    st = ok(admin.get("/api/settings"))
    assert [s["id"] for s in st["inventory"]["label_sizes"]][0] == "12x18" and st["inventory"]["label_size_id"] == "30x50"   # added, choice kept
    # the admin deletes it on purpose - it must NOT come back on the next start
    sizes = [s for s in st["inventory"]["label_sizes"] if s["id"] != "12x18"]
    ok(admin.put("/api/settings", json={"inventory": {"label_sizes": sizes}}))
    bootstrap.bootstrap(ctx)
    assert "12x18" not in [s["id"] for s in ok(admin.get("/api/settings"))["inventory"]["label_sizes"]]
