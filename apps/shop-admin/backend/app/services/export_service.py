"""Excel and PDF files, and the data exports (products, sales, purchases, expenses, ...).

Reports and exports share one structure (see report_service) so a downloaded file always matches the screen.
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime

import xlsxwriter
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.context import AppContext
from app.services import customer_service, inventory_service, report_service, sale_service, settings_service
from app.services.invoice_service import CREAM, GOLD, GOLD_LIGHT, MAROON, fonts
from app.utils.dates import date_of, in_range, product_age_days
from app.utils.money import format_inr

MONEY_FMT = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"##,##0.00'
INT_FMT = "#,##0"
DATE_FMT = "DD/MM/YYYY"
DATETIME_FMT = "DD/MM/YYYY HH:MM"



def _safe_sheet(name: str, used: set[str]) -> str:
    base = re.sub(r"[\[\]\*\?/\\:]", " ", name).strip()[:28] or "Sheet"
    out, n = base, 2
    while out.lower() in used:
        out = f"{base[:25]} {n}"
        n += 1
    used.add(out.lower())
    return out


def _to_date(v):
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return v


def _to_dt(v):
    try:
        return datetime.fromisoformat(str(v))
    except ValueError:
        return v


def _cell_value(col_type: str, v):
    if v is None or v == "":
        return None
    if col_type == "date":
        return _to_date(v)
    if col_type == "datetime":
        return _to_dt(v)
    return v


def _fmt_for(col_type: str) -> str | None:
    return {"money": MONEY_FMT, "int": INT_FMT, "date": DATE_FMT, "datetime": DATETIME_FMT, "percent": '0.0"%"'}.get(col_type)


# ------------------------------------------------------------------ Excel
def _xl_col(i: int) -> str:
    return get_column_letter(i + 1)


def report_to_xlsx(ctx: AppContext, report: dict) -> bytes:
    """Professional workbook: Summary sheet, one details sheet per section (filters, frozen header, totals row), Totals sheet.

    Written with xlsxwriter, which is many times faster than styling cells one by one (a 150,000-row sales export
    takes seconds, not minutes).
    """
    biz = settings_service.get(ctx)["business"]
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True, "default_date_format": "dd/mm/yyyy", "nan_inf_to_errors": True})
    fmt = {
        "money": wb.add_format({"num_format": MONEY_FMT, "align": "right"}),
        "int": wb.add_format({"num_format": INT_FMT, "align": "right"}),
        "percent": wb.add_format({"num_format": '0.0"%"', "align": "right"}),
        "date": wb.add_format({"num_format": DATE_FMT, "align": "left"}),
        "datetime": wb.add_format({"num_format": DATETIME_FMT, "align": "left"}),
        "text": wb.add_format({}),
    }
    head_l = wb.add_format({"bold": True, "font_color": "#F5ECC9", "bg_color": "#5A1024", "valign": "vcenter", "text_wrap": True, "align": "left"})
    head_r = wb.add_format({"bold": True, "font_color": "#F5ECC9", "bg_color": "#5A1024", "valign": "vcenter", "text_wrap": True, "align": "right"})
    tot_fmt = {k: wb.add_format({"bold": True, "bg_color": "#F5ECC9", "top": 2, "top_color": "#B98F36", **({"num_format": v} if v else {}), "align": "right" if k in ("money", "int", "percent") else "left"})
               for k, v in (("money", MONEY_FMT), ("int", INT_FMT), ("percent", '0.0"%"'), ("text", None), ("date", None), ("datetime", None))}
    used: set[str] = set()

    # ---- Summary
    ws = wb.add_worksheet(_safe_sheet("Summary", used))
    ws.hide_gridlines(2)
    ws.write("A1", biz["name"], wb.add_format({"font_name": "Georgia", "font_size": 18, "bold": True, "font_color": "#5A1024"}))
    ws.write("A2", biz["tagline"], wb.add_format({"font_name": "Georgia", "italic": True, "font_color": "#B98F36"}))
    ws.write("A4", report["title"], wb.add_format({"font_size": 14, "bold": True, "font_color": "#5A1024"}))
    ws.write("A5", report["subtitle"])
    ws.write("A6", f"Generated: {datetime.now().strftime('%d/%m/%Y %I:%M %p')}", wb.add_format({"font_size": 9, "font_color": "#777777"}))
    label_f = wb.add_format({"bold": True, "bg_color": "#FBF6EC", "bottom": 1, "bottom_color": "#D9C9A8"})
    row = 7
    for item in report["summary"]:
        ws.write(row, 0, item["label"], label_f)
        kind = item["type"] if item["type"] in fmt else "text"
        vf = wb.add_format({"bg_color": "#FBF6EC", "bottom": 1, "bottom_color": "#D9C9A8", "align": "right",
                            **({"num_format": {"money": MONEY_FMT, "int": INT_FMT, "percent": '0.0"%"'}[kind]} if kind in ("money", "int", "percent") else {})})
        ws.write(row, 1, item["value"], vf)
        row += 1
    note_f = wb.add_format({"italic": True, "font_size": 9, "font_color": "#777777"})
    for note in report.get("notes", []):
        row += 1
        ws.write(row, 0, note, note_f)
    ws.set_column(0, 0, max(34, max((len(x["label"]) for x in report["summary"]), default=0) + 4))
    ws.set_column(1, 1, 26)

    # ---- one sheet per section
    for i, sec in enumerate(report["sections"]):
        sh = wb.add_worksheet(_safe_sheet("Details" if i == 0 else sec["title"], used))
        cols, rows = sec["columns"], sec["rows"]
        widths = [len(c["label"]) + 2 for c in cols]
        for ci, col in enumerate(cols):
            sh.write(0, ci, col["label"], head_r if col["type"] in ("money", "int", "percent") else head_l)
        for ri, r in enumerate(rows, 1):
            for ci, col in enumerate(cols):
                v = r.get(col["key"])
                if v is None or v == "":
                    continue
                t = col["type"]
                if t == "date":
                    sh.write_datetime(ri, ci, datetime.combine(_to_date(v), datetime.min.time()), fmt["date"]) if isinstance(_to_date(v), date) else sh.write(ri, ci, v)
                elif t == "datetime":
                    dtv = _to_dt(v)
                    sh.write_datetime(ri, ci, dtv, fmt["datetime"]) if isinstance(dtv, datetime) else sh.write(ri, ci, v)
                elif t in ("money", "int", "percent"):
                    sh.write_number(ri, ci, float(v), fmt[t])
                else:
                    sh.write_string(ri, ci, str(v))
                shown = len(str(v))
                if shown + 2 > widths[ci]:
                    widths[ci] = min(shown + (6 if t == "money" else 2), 48)
        last = len(rows)
        if rows:
            tr = last + 1
            sh.write(tr, 0, "Total", tot_fmt["text"])
            for ci, col in enumerate(cols):
                if ci == 0:
                    continue
                if col["type"] in ("money", "int"):
                    L = _xl_col(ci)
                    cached = (sec.get("totals") or {}).get(col["key"], 0)
                    sh.write_formula(tr, ci, f"=SUBTOTAL(109,{L}2:{L}{last + 1})", tot_fmt[col["type"]], cached)   # follows the filter, like Excel's Total row
                else:
                    sh.write_blank(tr, ci, None, tot_fmt["text"])
            sh.autofilter(0, 0, last, len(cols) - 1)
        sh.freeze_panes(1, 0)
        for ci, w in enumerate(widths):
            sh.set_column(ci, ci, min(max(w + 1, 10), 50))
        sh.set_row(0, 22)
        sh.set_landscape()
        sh.fit_to_pages(1, 0)
        sh.repeat_rows(0)

    # ---- Totals
    tot = wb.add_worksheet(_safe_sheet("Totals", used))
    tot.write("A1", f"{report['title']} - Totals", wb.add_format({"font_size": 13, "bold": True, "font_color": "#5A1024"}))
    r = 2
    bold_m = wb.add_format({"bold": True, "font_color": "#5A1024"})
    for sec in report["sections"]:
        if not sec.get("totals"):
            continue
        tot.write(r, 0, sec["title"], bold_m)
        r += 1
        for col in sec["columns"]:
            if col["type"] in ("money", "int") and col["key"] in sec["totals"]:
                tot.write(r, 0, col["label"])
                tot.write_number(r, 1, float(sec["totals"][col["key"]]), fmt[col["type"]])
                r += 1
        r += 1
    tot.set_column(0, 0, 40)
    tot.set_column(1, 1, 22)
    wb.close()
    return buf.getvalue()


# ------------------------------------------------------------------ PDF
def report_to_pdf(ctx: AppContext, report: dict) -> bytes:
    biz = settings_service.get(ctx)["business"]
    F = fonts()
    sym = F["symbol"]

    def fmt(t: str, v):
        if v is None or v == "":
            return ""
        if t == "money":
            return format_inr(v, sym)
        if t == "int":
            return format_inr(v, "", 0)
        if t == "percent":
            return f"{float(v):g}%"
        if t == "date":
            return date_of(str(v))[8:10] + "/" + str(v)[5:7] + "/" + str(v)[:4]
        if t == "datetime":
            try:
                return datetime.fromisoformat(str(v)).strftime("%d/%m/%Y %H:%M")
            except ValueError:
                return str(v)
        return str(v)

    def st(name, **kw):
        base = dict(fontName=F["regular"], fontSize=8, leading=10, textColor=colors.HexColor("#2b1a1f"))
        base.update(kw)
        return ParagraphStyle(name, **base)

    cell, cell_r = st("c"), st("cr", alignment=TA_RIGHT)
    head = st("h", fontName=F["bold"], textColor=colors.HexColor("#f5ecc9"))
    head_r = st("hr", fontName=F["bold"], textColor=colors.HexColor("#f5ecc9"), alignment=TA_RIGHT)
    bold_r = st("br", fontName=F["bold"], alignment=TA_RIGHT)
    bold = st("b", fontName=F["bold"])

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12 * mm, rightMargin=12 * mm, topMargin=12 * mm,
                            bottomMargin=14 * mm, title=report["title"], author=biz["name"])
    story = [Paragraph(biz["name"], st("brand", fontName=F["serif"], fontSize=17, leading=20, textColor=MAROON)),
             Paragraph(biz["tagline"], st("tag", fontName=F["serif_italic"], fontSize=9, textColor=GOLD)), Spacer(1, 3 * mm),
             Paragraph(report["title"], st("t", fontName=F["serif"], fontSize=14, leading=17, textColor=MAROON)),
             Paragraph(f"{report['subtitle']} &nbsp;·&nbsp; generated {datetime.now().strftime('%d/%m/%Y %I:%M %p')}", st("sub", textColor=colors.HexColor("#6b5a5f"))),
             Spacer(1, 4 * mm)]
    if report["summary"]:
        cells = [[Paragraph(s["label"], st("sl", fontSize=7, textColor=colors.HexColor("#6b5a5f"))),
                  Paragraph(fmt(s["type"], s["value"]), st("sv", fontName=F["bold"], fontSize=11, leading=13, textColor=MAROON))] for s in report["summary"]]
        per_row = 4
        grid = []
        for i in range(0, len(cells), per_row):
            chunk = cells[i:i + per_row]
            grid.append([[c[0], c[1]] for c in chunk] + [""] * (per_row - len(chunk)))
        t = Table(grid, colWidths=[(297 - 24) / per_row * mm] * per_row)
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), CREAM), ("BOX", (0, 0), (-1, -1), 0.5, GOLD), ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e6dcc4")),
                               ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("VALIGN", (0, 0), (-1, -1), "TOP")]))
        story += [t, Spacer(1, 5 * mm)]
    for sec in report["sections"]:
        if not sec["rows"]:
            continue
        story.append(Paragraph(sec["title"], st("st", fontName=F["serif"], fontSize=11, leading=14, textColor=MAROON)))
        story.append(Spacer(1, 1.5 * mm))
        cols = sec["columns"]
        rights = [c["type"] in ("money", "int", "percent") for c in cols]
        data = [[Paragraph(c["label"], head_r if rt else head) for c, rt in zip(cols, rights)]]
        for r in sec["rows"]:
            data.append([Paragraph(fmt(c["type"], r.get(c["key"])), cell_r if rt else cell) for c, rt in zip(cols, rights)])
        if sec.get("totals"):
            tt = sec["totals"]
            data.append([Paragraph(fmt(c["type"], tt.get(c["key"], "")), bold_r if rt else bold) for c, rt in zip(cols, rights)])
        width = (297 - 24) * mm
        t = Table(data, colWidths=[width / len(cols)] * len(cols), repeatRows=1)
        style = [("BACKGROUND", (0, 0), (-1, 0), MAROON), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                 ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]), ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#e6dcc4")),
                 ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("BOX", (0, 0), (-1, -1), 0.5, GOLD)]
        if sec.get("totals"):
            style += [("BACKGROUND", (0, -1), (-1, -1), GOLD_LIGHT), ("LINEABOVE", (0, -1), (-1, -1), 0.8, GOLD)]
        t.setStyle(TableStyle(style))
        story += [t, Spacer(1, 6 * mm)]
    for n in report.get("notes", []):
        story.append(Paragraph(n, st("note", fontSize=7.5, textColor=colors.HexColor("#6b5a5f"))))
    if not any(s["rows"] for s in report["sections"]) and not report["summary"]:
        story.append(Paragraph("No data for the selected period.", cell))

    def footer(canvas, d):
        canvas.saveState()
        canvas.setFont(F["regular"], 7)
        canvas.setFillColor(colors.HexColor("#6b5a5f"))
        canvas.drawString(12 * mm, 7 * mm, f"{biz['name']} - {report['title']}")
        canvas.drawRightString(landscape(A4)[0] - 12 * mm, 7 * mm, f"Page {d.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()


# ------------------------------------------------------------------ data exports
def _wrap(key: str, title: str, subtitle: str, sections: list[dict]) -> dict:
    return {"key": key, "title": title, "subtitle": subtitle, "params": {}, "summary": [{"label": "Records", "value": len(sections[0]["rows"]), "type": "int", "tone": "", "hint": ""}],
            "sections": sections, "chart": None, "notes": [], "generated_at": ""}


def export_data(ctx: AppContext, entity: str, start: str = "", end: str = "") -> dict:
    C, sec = report_service.C, report_service.section
    names = report_service._names(ctx)
    s = ctx.store
    if entity == "products":
        cols = [C("id", "Product ID"), C("sku", "SKU"), C("barcode", "Barcode"), C("name", "Product name"), C("category", "Category"), C("subcategory", "Sub-category"),
                C("vendor", "Vendor"), C("design_number", "Design no."), C("size", "Size"), C("colour", "Colour"), C("material", "Material"), C("collection", "Collection"),
                C("tags", "Tags"), C("purchase_rate", "Purchase rate", "money"), C("selling_price", "Selling price", "money"), C("initial_quantity", "Initial qty", "int"),
                C("sold_quantity", "Sold qty", "int"), C("current_quantity", "Current qty", "int"), C("location", "Location(s)"), C("rack", "Rack"),
                C("added", "Date added", "date"), C("age_days", "Age (days)", "int"), C("status", "Status")]
        subs = {r["id"]: r["name"] for r in s.all("subcategories")}
        rows = [{"id": p["id"], "sku": p["sku"], "barcode": p["barcode"], "name": p["name"], "category": names["categories"].get(p["category_id"], ""),
                 "subcategory": subs.get(p.get("subcategory_id", ""), ""), "vendor": names["vendors"].get(p.get("vendor_id", ""), ""),
                 "design_number": p.get("design_number", ""), "size": p.get("size", ""), "colour": p.get("colour", ""), "material": p.get("material", ""),
                 "collection": p.get("collection", ""), "tags": ", ".join(p.get("tags", [])), "purchase_rate": p["purchase_rate"], "selling_price": p["selling_price"],
                 "initial_quantity": p["initial_quantity"], "sold_quantity": p["sold_quantity"], "current_quantity": inventory_service.total_stock(p),
                 "location": report_service._loc_text(p, names), "rack": p.get("rack", ""), "added": date_of(p["date_added"]),
                 "age_days": product_age_days(p["date_added"]), "status": p["status"]} for p in s.all("products") if p["status"] != "deleted"]
        return _wrap("products", "Products", "All products", [sec("Products", cols, rows, totals=False)])
    if entity == "sales":
        cols = [C("invoice", "Invoice"), C("date", "Date & time", "datetime"), C("customer", "Customer"), C("mobile", "Mobile"), C("cashier", "Cashier"),
                C("items", "Items", "int"), C("subtotal", "Gross", "money"), C("discount", "Discount", "money"), C("net", "Net", "money"), C("tax", "Tax", "money"),
                C("total", "Bill total", "money"), C("payment", "Payment"), C("status", "Status")]
        sales = [x for x in s.all("sales") if in_range(date_of(x["date_time"]), start or None, end or None)]
        rows = [{"invoice": x["invoice_number"], "date": x["date_time"], "customer": x["customer_name"], "mobile": x.get("customer_mobile", ""), "cashier": x.get("cashier_name", ""),
                 "items": x["item_count"], "subtotal": x["subtotal"], "discount": x["discount_amount"], "net": x.get("net_amount", 0),
                 "tax": x.get("tax_amount", 0), "total": x["total"], "payment": x["payment_method"], "status": x["status"]} for x in sales]
        icols = [C("invoice", "Invoice"), C("date", "Date", "date"), C("sku", "SKU"), C("name", "Product"), C("quantity", "Qty", "int"), C("unit_price", "Rate", "money"),
                 C("discount", "Discount", "money"), C("line_total", "Amount", "money"), C("taken", "Stock taken from"), C("status", "Status")]
        irows = [{"invoice": x["invoice_number"], "date": date_of(x["date_time"]), "sku": i["sku"], "name": i["name"], "quantity": i["quantity"], "unit_price": i["unit_price"],
                  "discount": i["discount_amount"], "line_total": i["line_total"],
                  "taken": ", ".join(f"{a['location_name']} x {a['quantity']}" for a in sale_service.item_allocations(x, i)),
                  "status": x["status"]} for x in sales for i in x["items"]]
        return _wrap("sales", "Sales", f"{start or 'start'} to {end or 'today'}", [sec("Bills", cols, rows, totals=False), sec("Bill items", icols, irows, totals=False)])
    if entity == "purchases":
        cols = [C("date", "Date", "date"), C("id", "Purchase"), C("vendor", "Vendor"), C("invoice", "Invoice no."), C("location", "Location"), C("sku", "SKU"), C("name", "Product"),
                C("quantity", "Qty", "int"), C("rate", "Rate", "money"), C("total", "Total", "money")]
        rows = [{"date": p["purchase_date"], "id": p["id"], "vendor": p.get("vendor_name", ""), "invoice": p.get("invoice_number", ""), "location": names["locations"].get(p["location_id"], ""),
                 "sku": i["sku"], "name": i["name"], "quantity": i["quantity"], "rate": i["rate"], "total": i["total"]}
                for p in s.all("purchases") if in_range(p["purchase_date"], start or None, end or None) for i in p["items"]]
        return _wrap("purchases", "Purchases", f"{start or 'start'} to {end or 'today'}", [sec("Purchase lines", cols, rows, totals=False)])
    if entity == "expenses":
        cols = [C("date", "Date", "date"), C("id", "Expense ID"), C("category", "Category"), C("description", "Description"), C("payee", "Vendor / Payee"), C("amount", "Amount", "money"),
                C("method", "Payment"), C("reference", "Reference"), C("notes", "Notes"), C("by", "Added by"), C("status", "Status"), C("reason", "Cancel reason")]
        rows = [{"date": e["expense_date"], "id": e["id"], "category": e["category_name"], "description": e["description"], "payee": e.get("payee", ""), "amount": e["amount"],
                 "method": e["payment_method"], "reference": e.get("reference_no", ""), "notes": e.get("notes", ""), "by": e.get("created_by_name", ""), "status": e["status"],
                 "reason": e.get("cancel_reason", "")} for e in s.all("expenses") if in_range(e["expense_date"], start or None, end or None)]
        return _wrap("expenses", "Expenses", f"{start or 'start'} to {end or 'today'}", [sec("Expenses", cols, rows, totals=False)])
    if entity == "customers":
        cols = [C("id", "Customer ID"), C("name", "Name"), C("mobile", "Mobile"), C("email", "Email"), C("address", "Address"), C("bills", "Bills", "int"), C("spent", "Total spent", "money"),
                C("last", "Last purchase", "date"), C("notes", "Notes")]
        rows = [{"id": c["id"], "name": c["name"], "mobile": c["mobile"], "email": c.get("email", ""), "address": c.get("address", ""), "bills": c["bill_count"],
                 "spent": c["total_spent"], "last": date_of(c["last_purchase"]), "notes": c.get("notes", "")} for c in
                customer_service.with_stats(ctx, list(s.all("customers")))]
        return _wrap("customers", "Customers", "All customers", [sec("Customers", cols, rows, totals=False)])
    if entity == "vendors":
        cols = [C("id", "Vendor ID"), C("name", "Vendor"), C("contact_person", "Contact person"), C("phone", "Phone"), C("email", "Email"), C("address", "Address"),
                C("city", "City"), C("state", "State"), C("gst_number", "GST number"), C("notes", "Notes"), C("active", "Active")]
        rows = [{**{k: v.get(k, "") for k in ("id", "name", "contact_person", "phone", "email", "address", "city", "state", "gst_number", "notes")}, "active": "Yes" if v["active"] else "No"} for v in s.all("vendors")]
        return _wrap("vendors", "Vendors", "All vendors", [sec("Vendors", cols, rows, totals=False)])
    if entity == "audit_logs":
        cols = [C("time", "Date & time", "datetime"), C("user", "User"), C("action", "Action"), C("entity", "Entity"), C("entity_id", "Entity ID"), C("details", "Details")]
        rows = [{"time": a["timestamp"], "user": a["username"], "action": a["action"], "entity": a.get("entity", ""), "entity_id": a.get("entity_id", ""),
                 "details": a["details"] if isinstance(a["details"], str) else str(a["details"])}
                for a in reversed(s.all("audit_logs")) if in_range(date_of(a["timestamp"]), start or None, end or None)]
        return _wrap("audit_logs", "Audit Log", f"{start or 'start'} to {end or 'today'}", [sec("Audit log", cols, rows, totals=False)])
    if entity == "inventory_transactions":
        cols = [C("time", "Date & time", "datetime"), C("sku", "SKU"), C("name", "Product"), C("location", "Location"), C("type", "Type"), C("quantity", "Change", "int"),
                C("before", "Before", "int"), C("after", "After", "int"), C("ref", "Reference"), C("user", "By"), C("remarks", "Remarks")]
        rows = [{"time": t["date_time"], "sku": t["sku"], "name": t["product_name"], "location": t["location_name"], "type": t["type"], "quantity": t["quantity"],
                 "before": t["previous_stock"], "after": t["new_stock"], "ref": t.get("reference_id", ""), "user": t["username"], "remarks": t.get("remarks", "")}
                for t in reversed(s.all("inventory_transactions")) if in_range(date_of(t["date_time"]), start or None, end or None)]
        return _wrap("inventory_transactions", "Inventory History", f"{start or 'start'} to {end or 'today'}", [sec("Movements", cols, rows, totals=False)])
    raise ValueError(entity)


ENTITY_PERMS = {"products": "inventory.view", "sales": "sales.view", "purchases": "purchases.view", "expenses": "expenses.view",
                "customers": "customers.view", "vendors": "purchases.view", "audit_logs": "admin.audit_logs",
                "inventory_transactions": "inventory.view"}
