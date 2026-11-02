"""Expenses, dashboard, reports, exports and profitability (Phase 6 + 8)."""
from __future__ import annotations

import io
from datetime import date, timedelta

from openpyxl import load_workbook

from tests.helpers import basic_setup, make_product, ok

TODAY = date.today().isoformat()


def cat_id(c, name):
    return next(x["id"] for x in ok(c.get("/api/expense-categories"))["items"] if x["name"] == name)


def add_expense(c, category="Packaging", amount=1500, **extra):
    body = {"expense_date": TODAY, "category_id": cat_id(c, category), "description": "Shopping bags", "amount": amount,
            "payee": "ABC Packaging", "payment_method": "UPI", "reference_no": "UPI12345", "notes": "Medium-size", **extra}
    return c.post("/api/expenses", json=body)


def sell_one(c, loc, p, qty=2, **extra):
    return ok(c.post("/api/sales", json={"location_id": loc["id"], "items": [{"product_id": p["id"], "quantity": qty}],
                                         "payment_method": "UPI", **extra}))


# ------------------------------------------------------------------ expenses
def test_add_expense_and_fields(admin, ctx):
    e = ok(add_expense(admin))
    assert e["id"].startswith("EXP-") and e["amount"] == 1500 and e["category_name"] == "Packaging"
    assert e["payee"] == "ABC Packaging" and e["payment_method"] == "UPI" and e["reference_no"] == "UPI12345"
    assert e["status"] == "active" and e["created_by_name"] == "Shop Owner" and e["created_at"]
    assert any(a["action"] == "EXPENSE_ADDED" for a in ctx.store.all("audit_logs"))


def test_invalid_expenses_rejected(admin):
    for bad in ({"amount": 0}, {"amount": -50}, {"description": ""}, {"category_id": "ECT-9999"}, {"payment_method": "Gold coins"},
                {"expense_date": "not-a-date"}, {"amount": 5_000_000_000}):
        assert add_expense(admin, **bad).status_code in (422, 400), bad
    assert ok(admin.get("/api/expenses"))["total"] == 0


def test_expense_edit_cancel_never_deletes(admin, ctx):
    e = ok(add_expense(admin))
    upd = ok(admin.put(f"/api/expenses/{e['id']}", json={"amount": 1800, "description": "Bags (large)"}))
    assert upd["amount"] == 1800 and upd["description"] == "Bags (large)"
    assert admin.put(f"/api/expenses/{e['id']}", json={"amount": -1}).status_code == 422
    assert admin.post(f"/api/expenses/{e['id']}/cancel", json={"reason": ""}).status_code == 422
    c = ok(admin.post(f"/api/expenses/{e['id']}/cancel", json={"reason": "entered twice"}))
    assert c["status"] == "cancelled"
    assert admin.post(f"/api/expenses/{e['id']}/cancel", json={"reason": "again"}).status_code == 409
    assert admin.put(f"/api/expenses/{e['id']}", json={"amount": 5}).status_code == 409
    assert ok(admin.get("/api/expenses"))["total"] == 1                    # still on record
    assert ok(admin.get("/api/expenses"))["total_amount"] == 0             # but not counted
    actions = [a["action"] for a in ctx.store.all("audit_logs")]
    assert "EXPENSE_EDITED" in actions and "EXPENSE_CANCELLED" in actions


def test_expense_receipt_upload_rules(admin, settings):
    e = ok(add_expense(admin))
    pdf = b"%PDF-1.4\n%fake but valid header\n"
    r = ok(admin.post(f"/api/expenses/{e['id']}/receipt", files={"file": ("bill.pdf", pdf, "application/pdf")}))
    assert r["receipt"].startswith("uploads/expenses/EXP-") and r["receipt_url"]
    served = admin.get(r["receipt_url"])
    assert served.status_code == 200 and served.content == pdf and served.headers["content-type"] == "application/pdf"
    assert admin.post(f"/api/expenses/{e['id']}/receipt", files={"file": ("x.exe", b"MZ", "application/x-msdownload")}).status_code == 422
    assert admin.post(f"/api/expenses/{e['id']}/receipt", files={"file": ("x.pdf", b"not a pdf", "application/pdf")}).status_code == 422
    assert admin.post(f"/api/expenses/{e['id']}/receipt", files={"file": ("big.pdf", b"%PDF" + b"0" * (9 * 1024 * 1024), "application/pdf")}).status_code == 422
    assert admin.get("/api/files/expenses/..%2Fusers.json").status_code == 404
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    r2 = ok(admin.post(f"/api/expenses/{e['id']}/receipt", files={"file": ("../../evil name.png", png, "image/png")}))
    assert "evil" not in r2["receipt"] and ".." not in r2["receipt"]           # unique safe filename
    assert len(list((settings.uploads_dir / "expenses").glob("*"))) == 1        # the old receipt was replaced


def test_expense_permissions(admin, make_staff):
    e = ok(add_expense(admin))
    nobody = make_staff([])
    assert nobody.get("/api/expenses").status_code == 403 and add_expense(nobody).status_code == 403
    viewer = make_staff(["expenses.view"])
    assert viewer.get("/api/expenses").status_code == 200 and add_expense(viewer).status_code == 403
    assert viewer.get(f"/api/files/expenses/whatever.pdf").status_code == 404
    adder = make_staff(["expenses.add"])
    ok(add_expense(adder))
    assert adder.put(f"/api/expenses/{e['id']}", json={"amount": 1}).status_code == 403
    assert adder.post(f"/api/expenses/{e['id']}/cancel", json={"reason": "abc"}).status_code == 403


def test_expense_filters(admin):
    add_expense(admin, "Packaging", 1500)
    add_expense(admin, "Marketing", 1000, description="Instagram promotion", payee="Meta", payment_method="UPI")
    add_expense(admin, "Shop Rent", 10000, payment_method="Cash", payee="Landlord", expense_date="2020-01-15")
    assert ok(admin.get("/api/expenses"))["total"] == 3
    assert ok(admin.get(f"/api/expenses?category_id={cat_id(admin, 'Marketing')}"))["total_amount"] == 1000
    assert ok(admin.get("/api/expenses?payment_method=Cash"))["total"] == 1
    assert ok(admin.get(f"/api/expenses?start={TODAY}"))["total_amount"] == 2500
    assert ok(admin.get("/api/expenses?q=instagram"))["total"] == 1
    assert ok(admin.get("/api/expenses?payee=landlord"))["total"] == 1


# ------------------------------------------------------------------ dashboard
def test_dashboard_starts_at_zero_and_comes_from_real_data(admin):
    d = ok(admin.get("/api/dashboard"))
    assert d["today"]["net"] == 0 and d["today"]["bills"] == 0 and d["expenses"]["today"] == 0
    assert d["inventory"]["total_products"] == 0 and d["profit"]["net_result"] == 0
    assert all(p["value"] == 0 for p in d["chart_daily_sales"]) and len(d["chart_daily_sales"]) == 30
    assert len(d["chart_monthly_sales"]) == 12 and len(d["chart_monthly_expenses"]) == 12


def test_dashboard_updates_after_sale_expense_and_cancel(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, sku="ABH-JHM-TEST001", selling_price=699, purchase_rate=300, initial_quantity=10)
    d = ok(admin.get("/api/dashboard"))
    assert d["inventory"]["total_products"] == 1 and d["inventory"]["total_stock"] == 10 and d["inventory"]["stock_value"] == 3000
    sale = sell_one(admin, loc, p, 2, discount_type="percent", discount_value=10)
    d = ok(admin.get("/api/dashboard"))
    assert d["today"]["net"] == 1258.20 and d["today"]["bills"] == 1 and d["today"]["items"] == 2 and d["today"]["discount"] == 139.80
    assert d["month_sales"]["net"] == 1258.20 and d["inventory"]["total_stock"] == 8
    assert d["chart_daily_sales"][-1]["value"] == 1258.20
    assert d["chart_payment_methods"] == [{"label": "UPI", "value": 1258.20}]
    assert d["chart_category_sales"][0]["value"] == 1258.20
    assert d["profit"]["sales"] == 1258.20 and d["profit"]["cogs"] == 600 and d["profit"]["gross_profit"] == 658.20
    ok(add_expense(admin, "Packaging", 1500))
    d = ok(admin.get("/api/dashboard"))
    assert d["expenses"]["today"] == 1500 and d["expenses"]["month"] == 1500
    assert d["profit"]["operating_expenses"] == 1500 and d["profit"]["net_result"] == round(658.20 - 1500, 2)
    assert d["chart_expense_categories"] == [{"label": "Packaging", "value": 1500}]
    ok(admin.post(f"/api/sales/{sale['id']}/cancel", json={"reason": "test cancel"}))
    d = ok(admin.get("/api/dashboard"))
    assert d["today"]["net"] == 0 and d["today"]["bills"] == 0 and d["inventory"]["total_stock"] == 10
    assert d["profit"]["net_result"] == -1500


def test_dashboard_hides_sections_the_user_may_not_see(admin, make_staff):
    cashier = make_staff(["sales.create"])
    d = ok(cashier.get("/api/dashboard"))
    assert "profit" not in d and "expenses" not in d and "inventory" not in d and "today" not in d


# ------------------------------------------------------------------ reports
def test_daily_and_monthly_sales_reports(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, selling_price=1000, initial_quantity=20)
    sell_one(admin, loc, p, 2)
    sell_one(admin, loc, p, 1, discount_type="amount", discount_value=100)
    r = ok(admin.get("/api/reports/daily_sales"))
    labels = {s["label"]: s["value"] for s in r["summary"]}
    assert labels["Bills"] == 2 and labels["Items sold"] == 3 and labels["Gross sales"] == 3000 and labels["Discount"] == 100 and labels["Net sales"] == 2900
    assert r["sections"][0]["totals"]["net_amount"] == 2900 and len(r["sections"][0]["rows"]) == 2
    assert r["sections"][1]["rows"][0] == {"method": "UPI", "count": 2, "amount": 2900}
    today = date.today()
    m = ok(admin.get(f"/api/reports/monthly_sales?year={today.year}&month={today.month}"))
    assert {s["label"]: s["value"] for s in m["summary"]}["Net sales"] == 2900
    future = ok(admin.get(f"/api/reports/monthly_sales?year={today.year + 1}&month=3"))       # any month / year can be chosen
    assert {s["label"]: s["value"] for s in future["summary"]}["Net sales"] == 0 and len(future["sections"][0]["rows"]) == 31
    assert admin.get("/api/reports/monthly_sales?year=2026&month=13").status_code == 422
    assert admin.get("/api/reports/daily_sales?date=garbage").status_code == 422


def test_product_category_staff_payment_reports(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, selling_price=1000, purchase_rate=400, initial_quantity=20)
    sell_one(admin, loc, p, 3)
    prod = ok(admin.get("/api/reports/product_sales"))["sections"][0]
    assert prod["rows"][0]["quantity"] == 3 and prod["rows"][0]["net"] == 3000 and prod["rows"][0]["profit"] == 1800
    assert ok(admin.get("/api/reports/category_sales"))["sections"][0]["rows"][0]["category"] == "Earrings"
    assert ok(admin.get("/api/reports/staff_sales"))["sections"][0]["rows"][0]["staff"] == "Shop Owner"
    pay = ok(admin.get("/api/reports/payment_report"))["sections"][0]["rows"][0]
    assert pay["method"] == "UPI" and pay["received"] == 3000


def test_inventory_and_old_stock_reports_use_dynamic_age(admin, ctx):
    cat, ven, loc = basic_setup(admin)
    old = make_product(admin, cat, ven, loc, name="Old Piece", sku="ABH-OLD-1", initial_quantity=4, purchase_rate=100)
    make_product(admin, cat, ven, loc, name="New Piece", sku="ABH-NEW-1", initial_quantity=2, purchase_rate=50)
    with ctx.store.transaction() as tx:                     # pretend the old piece was added 100 days ago
        rec = tx.require("products", old["id"])
        rec["date_added"] = (date.today() - timedelta(days=100)).isoformat() + "T10:00:00"
        tx.put("products", rec)
    inv = ok(admin.get("/api/reports/inventory"))
    rows = {r["sku"]: r for r in inv["sections"][0]["rows"]}
    assert rows["ABH-OLD-1"]["age_days"] == 100 and rows["ABH-OLD-1"]["stock_value"] == 400 and rows["ABH-OLD-1"]["status"] == "Old stock"
    assert rows["ABH-NEW-1"]["age_days"] == 0
    assert inv["sections"][0]["totals"]["stock"] == 6 and inv["sections"][0]["totals"]["stock_value"] == 500
    os90 = ok(admin.get("/api/reports/old_stock?days=90"))
    assert [r["sku"] for r in os90["sections"][0]["rows"]] == ["ABH-OLD-1"]
    assert os90["sections"][0]["rows"][0]["age_group"] == "91-180 Days"
    assert ok(admin.get("/api/reports/old_stock?days=180"))["sections"][0]["rows"] == []
    assert len(ok(admin.get("/api/reports/old_stock?days=30"))["sections"][0]["rows"]) == 1
    assert ok(admin.get("/api/reports/inventory?stock_status=old_stock"))["sections"][0]["rows"][0]["sku"] == "ABH-OLD-1"
    assert ok(admin.get(f"/api/reports/inventory?location_id={loc['id']}"))["summary"][1]["value"] == 6


def test_purchase_report_is_separate_from_expenses(admin):
    cat, ven, loc = basic_setup(admin)
    make_product(admin, cat, ven, loc, purchase_rate=300, initial_quantity=20)            # 6,000 of stock
    add_expense(admin, "Packaging", 1500)
    pur = ok(admin.get("/api/reports/purchases"))
    assert {s["label"]: s["value"] for s in pur["summary"]}["Total purchase value"] == 6000
    exp = ok(admin.get("/api/reports/expenses"))
    assert {s["label"]: s["value"] for s in exp["summary"]}["Total expenses"] == 1500       # purchases NOT mixed in
    prof = ok(admin.get("/api/reports/profitability"))
    v = {s["label"]: s["value"] for s in prof["summary"]}
    assert v["Operating expenses"] == 1500 and v["Estimated gross profit"] == 0 and v["Inventory purchases in period"] == 6000
    assert v["Estimated net operating result"] == -1500                                    # purchases are not deducted
    assert any("ESTIMATES" in n for n in prof["notes"])


def test_expense_report_breakdowns_match_the_examples(admin):
    add_expense(admin, "Packaging", 2500, description="Shopping covers")
    add_expense(admin, "Marketing", 1000, description="Instagram promotion", payee="Meta")
    r = ok(admin.get("/api/reports/expenses"))
    assert {s["label"]: s["value"] for s in r["summary"]}["Total expenses"] == 3500
    by_cat = {row["category"]: row for row in r["sections"][1]["rows"]}
    assert by_cat["Packaging"]["amount"] == 2500 and by_cat["Marketing"]["percent"] == 28.6
    assert r["sections"][0]["totals"]["amount"] == 3500
    assert ok(admin.get(f"/api/reports/expenses?category_id={cat_id(admin, 'Marketing')}"))["sections"][0]["totals"]["amount"] == 1000
    assert ok(admin.get(f"/api/reports/expenses?start=2000-01-01&end=2000-01-31"))["sections"][0]["rows"] == []


def test_report_permissions(admin, make_staff):
    staff = make_staff(["reports.daily_sales"])
    assert staff.get("/api/reports/daily_sales").status_code == 200
    assert staff.get("/api/reports/profitability").status_code == 403
    assert staff.get("/api/reports/expenses/export").status_code == 403
    assert [r["key"] for r in ok(staff.get("/api/reports"))["items"]] == ["daily_sales"]
    assert len(ok(admin.get("/api/reports"))["items"]) == 11


# ------------------------------------------------------------------ Excel / PDF export
def test_excel_export_is_professional_and_correct(admin, settings):
    add_expense(admin, "Packaging", 1500)
    add_expense(admin, "Marketing", 1000, description="Instagram promotion")
    r = admin.get("/api/reports/expenses/export?format=xlsx")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/vnd.openxmlformats")
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames[0] == "Summary" and "Details" in wb.sheetnames and "Totals" in wb.sheetnames
    ws = wb["Details"]
    assert [c.value for c in ws[1]][:5] == ["Date", "Category", "Description", "Vendor / Payee", "Amount"]
    assert ws.freeze_panes == "A2" and ws.auto_filter.ref and ws["E2"].number_format.count("₹") >= 1
    assert ws["A2"].number_format == "DD/MM/YYYY" and isinstance(ws["A2"].value, (date,))
    assert ws["E2"].value == 1500 or ws["E2"].value == 1000
    assert str(ws["E4"].value).startswith("=SUBTOTAL(109,E2:E3)")                   # totals row
    assert ws.column_dimensions["C"].width >= 10
    tot = wb["Totals"]
    assert 2500 in [c.value for row in tot.iter_rows() for c in row]
    assert wb["Summary"]["A1"].value == "ABHARANAM COLLECTIONS"
    assert list(settings.exports_dir.glob("ABHARANAM_expenses_*.xlsx"))              # copy kept in exports/


def test_pdf_export_and_bad_formats(admin):
    add_expense(admin)
    r = admin.get("/api/reports/expenses/export?format=pdf")
    assert r.status_code == 200 and r.content[:5] == b"%PDF-"
    assert admin.get("/api/reports/expenses/export?format=docx").status_code == 422
    assert admin.get("/api/reports/nope/export").status_code == 404


def test_all_reports_and_entity_exports_produce_files(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, initial_quantity=10)
    sell_one(admin, loc, p, 1, customer={"name": "Lakshmi", "mobile": "9876543210"})
    add_expense(admin)
    for key in ok(admin.get("/api/reports"))["items"]:
        for fmt in ("xlsx", "pdf"):
            r = admin.get(f"/api/reports/{key['key']}/export?format={fmt}")
            assert r.status_code == 200 and len(r.content) > 500, (key["key"], fmt)
    for entity in ("products", "sales", "purchases", "expenses", "customers", "vendors", "audit_logs", "inventory_transactions"):
        r = admin.get(f"/api/export/{entity}")
        assert r.status_code == 200, (entity, r.text)
        wb = load_workbook(io.BytesIO(r.content))
        assert wb["Details"].max_row >= 2, entity
    products = load_workbook(io.BytesIO(admin.get("/api/export/products").content))["Details"]
    assert products["B2"].value == "ABH-EAR-000001"
    assert admin.get("/api/export/passwords").status_code == 404


def test_export_permissions(admin, make_staff):
    staff = make_staff(["inventory.view"])
    assert staff.get("/api/export/products").status_code == 403                       # needs data.export
    exporter = make_staff(["data.export", "inventory.view"])
    assert exporter.get("/api/export/products").status_code == 200
    assert exporter.get("/api/export/sales").status_code == 403                       # and the matching view permission
    assert exporter.get("/api/export/audit_logs").status_code == 403


def test_currency_formatting_helper_uses_indian_grouping():
    from app.utils.money import format_inr
    assert format_inr(125000) == "₹1,25,000.00"
    assert format_inr(1617.3) == "₹1,617.30"
    assert format_inr(12345678.9) == "₹1,23,45,678.90"
    assert format_inr(-2500) == "-₹2,500.00" and format_inr(0) == "₹0.00"
