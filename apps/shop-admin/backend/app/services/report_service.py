"""All reports.  Each report is plain data:

    {title, subtitle, params, summary:[{label,value,type}], sections:[{title, columns, rows, totals}], chart, notes}

The screens draw it, and the Excel / PDF exporters turn the very same structure into files, so what you see
is exactly what you download.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Callable

from app.core.context import AppContext
from app.core.errors import ValidationFailed
from app.services import analytics, inventory_service, product_service, settings_service
from app.utils.dates import age_bucket, date_of, in_range, now_iso, parse_date, product_age_days, today_iso
from app.utils.money import D, dsum, f

Row = dict


# ------------------------------------------------------------------ building blocks
def C(key: str, label: str, type: str = "text") -> dict:
    return {"key": key, "label": label, "type": type}


def S(label: str, value, type: str = "money", tone: str = "", hint: str = "") -> dict:
    return {"label": label, "value": value, "type": type, "tone": tone, "hint": hint}


def totals_of(cols: list[dict], rows: list[Row], label_key: str | None = None) -> Row:
    out: Row = {}
    for c in cols:
        if c["type"] in ("money", "int"):
            total = dsum(r.get(c["key"]) or 0 for r in rows)
            out[c["key"]] = int(total) if c["type"] == "int" else f(total)
    first = label_key or cols[0]["key"]
    if first not in out:
        out[first] = "Total"
    return out


def section(title: str, cols: list[dict], rows: list[Row], totals: bool = True) -> dict:
    return {"title": title, "columns": cols, "rows": rows, "totals": totals_of(cols, rows) if totals and rows else None}


def _report(key: str, title: str, subtitle: str, params: dict, summary: list[dict], sections: list[dict],
            chart: dict | None = None, notes: list[str] | None = None) -> dict:
    return {"key": key, "title": title, "subtitle": subtitle, "params": params, "summary": summary,
            "sections": sections, "chart": chart, "notes": notes or [], "generated_at": now_iso()}


def _dates(p: dict, default_start: str | None = None, default_end: str | None = None) -> tuple[str, str]:
    start = parse_date(p["start"], "From date").isoformat() if p.get("start") else (default_start or "")
    end = parse_date(p["end"], "To date").isoformat() if p.get("end") else (default_end or "")
    if start and end and start > end:
        raise ValidationFailed("The 'From' date must not be after the 'To' date.")
    return start, end


def _month_params(p: dict) -> tuple[int, int]:
    t = date.today()
    try:
        year, month = int(p.get("year") or t.year), int(p.get("month") or t.month)
    except ValueError:
        raise ValidationFailed("Year and month must be numbers.")
    if not (1 <= month <= 12) or not (2000 <= year <= 2200):
        raise ValidationFailed("Please choose a valid month and year.")
    return year, month


def _names(ctx: AppContext) -> dict:
    s = ctx.store
    return {k: {r["id"]: r["name"] for r in s.all(k)} for k in ("categories", "vendors", "locations", "expense_categories")}


def _can_profit(user: dict) -> bool:
    return user["role"] == "admin" or "reports.profitability" in user.get("permissions", [])


def _pay_section(ctx: AppContext, start: str, end: str, title: str = "Payment methods") -> dict:
    rows: dict[str, list] = {}
    for pay in ctx.store.all("payments"):
        if pay["status"] == "received" and in_range(date_of(pay["date_time"]), start, end):
            r = rows.setdefault(pay["method"], [0, Decimal("0")])
            r[0] += 1
            r[1] += D(pay["amount"])
    cols = [C("method", "Payment method"), C("count", "Payments", "int"), C("amount", "Amount", "money")]
    return section(title, cols, [{"method": m, "count": c, "amount": f(a)} for m, (c, a) in sorted(rows.items())])


def _summary_sales(a: dict, cancelled: list[dict] | None = None) -> list[dict]:
    out = [S("Bills", a["bills"], "int"), S("Items sold", a["items"], "int"), S("Gross sales", a["gross"]),
           S("Discount", a["discount"]), S("Net sales", a["net"]), ]
    if a["tax"]:
        out.append(S("Tax collected", a["tax"]))
    out.append(S("Total billed", a["total"]))
    if a["bills"]:
        out.append(S("Average bill", f(D(a["total"]) / a["bills"])))
    if cancelled:
        out.append(S("Cancelled bills (excluded)", len(cancelled), "int", hint="Cancelled sales are not counted in the figures above."))
    return out


# ------------------------------------------------------------------ SALES REPORTS
def daily_sales(ctx: AppContext, user: dict, p: dict) -> dict:
    day = parse_date(p.get("date") or today_iso(), "Date").isoformat()
    sales = analytics.sales_in(ctx, day, day)
    cancelled = analytics.sales_in(ctx, day, day, status="cancelled")
    a = analytics.aggregate(sales)
    cols = [C("time", "Time"), C("invoice_number", "Invoice"), C("customer_name", "Customer"), C("cashier_name", "Cashier"),
            C("item_count", "Items", "int"), C("subtotal", "Gross", "money"), C("discount_amount", "Discount", "money"),
            C("net_amount", "Net", "money"), C("total", "Bill total", "money"), C("payment_method", "Payment")]
    rows = [{"time": s["date_time"][11:16], **{k: s.get(k, 0) for k in ("invoice_number", "customer_name", "cashier_name", "item_count",
            "subtotal", "discount_amount", "net_amount", "total", "payment_method")}} for s in sorted(sales, key=lambda s: s["date_time"])]
    pay = _pay_section(ctx, day, day, "Payment breakdown")
    chart = {"kind": "bar", "title": "Payment methods", "data": [{"label": r["method"], "value": r["amount"]} for r in pay["rows"]]}
    return _report("daily_sales", "Daily Sales", f"Sales for {day}", {"date": day}, _summary_sales(a, cancelled),
                   [section("Bills", cols, rows), pay], chart)


def monthly_sales(ctx: AppContext, user: dict, p: dict) -> dict:
    year, month = _month_params(p)
    start, end = analytics.month_bounds(f"{year:04d}-{month:02d}")
    sales = analytics.sales_in(ctx, start, end)
    a = analytics.aggregate(sales)
    by_day: dict[str, list] = {}
    for s in sales:
        by_day.setdefault(date_of(s["date_time"]), []).append(s)
    last = int(end[8:])
    cols = [C("date", "Date", "date"), C("bills", "Bills", "int"), C("items", "Items", "int"), C("gross", "Gross", "money"),
            C("discount", "Discount", "money"), C("net", "Net sales", "money")]
    rows = []
    for d in range(1, last + 1):
        day = f"{year:04d}-{month:02d}-{d:02d}"
        ag = analytics.aggregate(by_day.get(day, []))
        rows.append({"date": day, "bills": ag["bills"], "items": ag["items"], "gross": ag["gross"], "discount": ag["discount"], "net": ag["net"]})
    chart = {"kind": "bar", "title": "Net sales per day", "data": [{"label": r["date"][8:], "value": r["net"]} for r in rows]}
    return _report("monthly_sales", "Monthly Sales", f"{date(year, month, 1).strftime('%B %Y')}", {"year": year, "month": month},
                   _summary_sales(a, analytics.sales_in(ctx, start, end, status="cancelled")),
                   [section("Day by day", cols, rows), _pay_section(ctx, start, end)], chart)


def _default_month(p: dict) -> tuple[str, str]:
    t = date.today()
    return _dates(p, t.replace(day=1).isoformat(), t.isoformat())


def product_sales(ctx: AppContext, user: dict, p: dict) -> dict:
    start, end = _default_month(p)
    cats = _names(ctx)["categories"]
    rows_by: dict[str, Row] = {}
    for s in analytics.sales_in(ctx, start, end):
        for it in s["items"]:
            r = rows_by.setdefault(it["product_id"], {"sku": it["sku"], "name": it["name"], "category": cats.get(it.get("category_id", ""), ""),
                                                      "quantity": 0, "gross": Decimal("0"), "discount": Decimal("0"), "net": Decimal("0"), "cogs": Decimal("0")})
            r["quantity"] += it["quantity"]
            r["gross"] += D(it["gross"])
            r["discount"] += D(it["discount_amount"])
            r["net"] += D(it["line_total"])
            r["cogs"] += D(it["unit_cost"]) * it["quantity"]
    profit = _can_profit(user)
    cols = [C("sku", "SKU"), C("name", "Product"), C("category", "Category"), C("quantity", "Qty sold", "int"), C("gross", "Gross", "money"),
            C("discount", "Discount", "money"), C("net", "Net sales", "money")]
    if profit:
        cols += [C("cogs", "Est. cost", "money"), C("profit", "Est. profit", "money")]
    rows = []
    for r in sorted(rows_by.values(), key=lambda r: r["net"], reverse=True):
        row = {**r, "gross": f(r["gross"]), "discount": f(r["discount"]), "net": f(r["net"])}
        if profit:
            row.update(cogs=f(r["cogs"]), profit=f(r["net"] - r["cogs"]))
        rows.append(row)
    chart = {"kind": "bar", "title": "Top products by net sales", "data": [{"label": r["name"][:18], "value": r["net"]} for r in rows[:10]]}
    return _report("product_sales", "Product Sales", f"{start} to {end}", {"start": start, "end": end},
                   [S("Products sold", len(rows), "int"), S("Pieces sold", sum(r["quantity"] for r in rows), "int"),
                    S("Net sales", f(dsum(r["net"] for r in rows)))], [section("Products", cols, rows)], chart)


def category_sales(ctx: AppContext, user: dict, p: dict) -> dict:
    start, end = _default_month(p)
    cats = _names(ctx)["categories"]
    agg: dict[str, Row] = {}
    for s in analytics.sales_in(ctx, start, end):
        for it in s["items"]:
            r = agg.setdefault(it.get("category_id", ""), {"category": cats.get(it.get("category_id", ""), "(unknown)"), "quantity": 0,
                                                            "gross": Decimal("0"), "discount": Decimal("0"), "net": Decimal("0")})
            r["quantity"] += it["quantity"]
            r["gross"] += D(it["gross"])
            r["discount"] += D(it["discount_amount"])
            r["net"] += D(it["line_total"])
    cols = [C("category", "Category"), C("quantity", "Qty sold", "int"), C("gross", "Gross", "money"), C("discount", "Discount", "money"), C("net", "Net sales", "money")]
    rows = [{**r, "gross": f(r["gross"]), "discount": f(r["discount"]), "net": f(r["net"])} for r in sorted(agg.values(), key=lambda r: r["net"], reverse=True)]
    chart = {"kind": "pie", "title": "Net sales by category", "data": [{"label": r["category"], "value": r["net"]} for r in rows]}
    return _report("category_sales", "Category Sales", f"{start} to {end}", {"start": start, "end": end},
                   [S("Categories sold", len(rows), "int"), S("Net sales", f(dsum(r["net"] for r in rows)))], [section("Categories", cols, rows)], chart)


def staff_sales(ctx: AppContext, user: dict, p: dict) -> dict:
    start, end = _default_month(p)
    agg: dict[str, list] = {}
    for s in analytics.sales_in(ctx, start, end):
        agg.setdefault(s["cashier_id"], []).append(s)
    cols = [C("staff", "Staff"), C("bills", "Bills", "int"), C("items", "Items", "int"), C("gross", "Gross", "money"), C("discount", "Discount", "money"), C("net", "Net sales", "money")]
    rows = []
    for sales in agg.values():
        a = analytics.aggregate(sales)
        rows.append({"staff": sales[0].get("cashier_name", ""), "bills": a["bills"], "items": a["items"], "gross": a["gross"], "discount": a["discount"], "net": a["net"]})
    rows.sort(key=lambda r: r["net"], reverse=True)
    chart = {"kind": "bar", "title": "Net sales by staff", "data": [{"label": r["staff"], "value": r["net"]} for r in rows]}
    return _report("staff_sales", "Staff Sales", f"{start} to {end}", {"start": start, "end": end},
                   [S("Staff who billed", len(rows), "int"), S("Net sales", f(dsum(r["net"] for r in rows)))], [section("Staff", cols, rows)], chart)


def payment_report(ctx: AppContext, user: dict, p: dict) -> dict:
    start, end = _default_month(p)
    agg: dict[str, Row] = {}
    for pay in ctx.store.all("payments"):
        if not in_range(date_of(pay["date_time"]), start, end):
            continue
        r = agg.setdefault(pay["method"], {"method": pay["method"], "count": 0, "received": Decimal("0"), "refunded": Decimal("0")})
        r["count"] += 1
        if pay["status"] == "received":
            r["received"] += D(pay["amount"])
        else:
            r["refunded"] += D(pay["amount"])
    cols = [C("method", "Payment method"), C("count", "Payments", "int"), C("received", "Received", "money"), C("refunded", "Refunded (cancelled sales)", "money"), C("net", "Net", "money")]
    rows = [{**r, "received": f(r["received"]), "refunded": f(r["refunded"]), "net": f(r["received"])} for r in sorted(agg.values(), key=lambda r: r["method"])]
    chart = {"kind": "pie", "title": "Money received by method", "data": [{"label": r["method"], "value": r["received"]} for r in rows]}
    return _report("payment_report", "Payment Report", f"{start} to {end}", {"start": start, "end": end},
                   [S("Money received", f(dsum(r["received"] for r in rows))), S("Refunded on cancelled sales", f(dsum(r["refunded"] for r in rows)))],
                   [section("By payment method", cols, rows)], chart)


# ------------------------------------------------------------------ INVENTORY REPORTS
def _loc_text(p: dict, names: dict, only: str = "") -> str:
    parts = [f"{names['locations'].get(l, l)} ({q})" for l, q in sorted(p["stock"].items()) if q > 0 and (not only or l == only)]
    return ", ".join(parts)


def inventory_report(ctx: AppContext, user: dict, p: dict) -> dict:
    names = _names(ctx)
    loc = p.get("location_id") or ""
    prods = product_service.search(ctx, q=p.get("q", ""), category_id=p.get("category_id", ""), vendor_id=p.get("vendor_id", ""),
                                   location_id=loc, stock_status=p.get("stock_status", ""), sort="name")
    cfg = settings_service.get(ctx)["inventory"]
    cols = [C("sku", "SKU"), C("name", "Product"), C("category", "Category"), C("vendor", "Vendor"), C("location", "Location"),
            C("purchase_rate", "Purchase rate", "money"), C("selling_price", "Selling price", "money"), C("stock", "Stock", "int"),
            C("stock_value", "Stock value (cost)", "money"), C("added", "Added on", "date"), C("age_days", "Age (days)", "int"), C("status", "Status")]
    rows = []
    by_cat: dict[str, Row] = {}
    for pr in prods:
        qty = pr["stock"].get(loc, 0) if loc else inventory_service.total_stock(pr)
        days = product_age_days(pr["date_added"])
        status = "Out of stock" if qty == 0 else "Low stock" if qty <= cfg["low_stock_threshold"] else "Old stock" if days > cfg["old_stock_days"] else "In stock"
        if pr["status"] == "inactive":
            status += " (inactive)"
        rows.append({"sku": pr["sku"], "name": pr["name"], "category": names["categories"].get(pr["category_id"], ""),
                     "vendor": names["vendors"].get(pr.get("vendor_id", ""), ""), "location": _loc_text(pr, names, loc),
                     "purchase_rate": pr["purchase_rate"], "selling_price": pr["selling_price"], "stock": qty,
                     "stock_value": f(D(pr["purchase_rate"]) * qty), "added": date_of(pr["date_added"]), "age_days": days, "status": status})
        c = by_cat.setdefault(pr["category_id"], {"category": names["categories"].get(pr["category_id"], ""), "products": 0, "pieces": 0,
                                                   "cost": Decimal("0"), "retail": Decimal("0")})
        c["products"] += 1
        c["pieces"] += qty
        c["cost"] += D(pr["purchase_rate"]) * qty
        c["retail"] += D(pr["selling_price"]) * qty
    cat_cols = [C("category", "Category"), C("products", "Products", "int"), C("pieces", "Pieces", "int"), C("cost", "Value at cost", "money"), C("retail", "Value at selling price", "money")]
    cat_rows = [{**r, "cost": f(r["cost"]), "retail": f(r["retail"])} for r in sorted(by_cat.values(), key=lambda r: r["category"])]
    chart = {"kind": "bar", "title": "Stock value by category (at cost)", "data": [{"label": r["category"], "value": r["cost"]} for r in cat_rows]}
    return _report("inventory", "Inventory Report", "Current stock", {k: p.get(k, "") for k in ("category_id", "vendor_id", "location_id", "stock_status", "q")},
                   [S("Products", len(rows), "int"), S("Pieces in stock", sum(r["stock"] for r in rows), "int"),
                    S("Stock value (at cost)", f(dsum(r["stock_value"] for r in rows))), S("Stock value (at selling price)", f(dsum(r["retail"] for r in cat_rows)))],
                   [section("Products", cols, rows), section("By category", cat_cols, cat_rows)], chart)


def old_stock(ctx: AppContext, user: dict, p: dict) -> dict:
    cfg = settings_service.get(ctx)["inventory"]
    try:
        days = int(p.get("days") or cfg["old_stock_days"])
    except ValueError:
        raise ValidationFailed("Days must be a number.")
    if days < 0:
        raise ValidationFailed("Days cannot be negative.")
    names = _names(ctx)
    cols = [C("name", "Product"), C("sku", "SKU"), C("category", "Category"), C("location", "Location"), C("stock", "Stock", "int"),
            C("purchase_rate", "Purchase rate", "money"), C("selling_price", "Selling price", "money"), C("added", "Added on", "date"),
            C("age_days", "Age (days)", "int"), C("age_group", "Age group"), C("value", "Est. stock value", "money")]
    rows = []
    buckets: dict[str, Row] = {}
    for pr in ctx.store.all("products"):
        qty = inventory_service.total_stock(pr)
        if pr["status"] == "deleted" or qty <= 0:
            continue
        age = product_age_days(pr["date_added"])
        if age <= days:
            continue
        val = D(pr["purchase_rate"]) * qty
        rows.append({"name": pr["name"], "sku": pr["sku"], "category": names["categories"].get(pr["category_id"], ""), "location": _loc_text(pr, names),
                     "stock": qty, "purchase_rate": pr["purchase_rate"], "selling_price": pr["selling_price"], "added": date_of(pr["date_added"]),
                     "age_days": age, "age_group": age_bucket(age), "value": f(val)})
        b = buckets.setdefault(age_bucket(age), {"group": age_bucket(age), "products": 0, "pieces": 0, "value": Decimal("0")})
        b["products"] += 1
        b["pieces"] += qty
        b["value"] += val
    rows.sort(key=lambda r: r["age_days"], reverse=True)
    order = ["0-30 Days", "31-60 Days", "61-90 Days", "91-180 Days", "181-365 Days", "365+ Days"]
    b_rows = [{**b, "value": f(b["value"])} for b in sorted(buckets.values(), key=lambda b: order.index(b["group"]))]
    b_cols = [C("group", "Age group"), C("products", "Products", "int"), C("pieces", "Pieces", "int"), C("value", "Est. stock value", "money")]
    chart = {"kind": "bar", "title": "Old stock value by age", "data": [{"label": b["group"], "value": b["value"]} for b in b_rows]}
    return _report("old_stock", "Old Stock Report", f"Products in stock for more than {days} days", {"days": days},
                   [S("Products", len(rows), "int"), S("Pieces", sum(r["stock"] for r in rows), "int"), S("Estimated stock value (at cost)", f(dsum(r["value"] for r in rows)))],
                   [section("Old products", cols, rows), section("By age group", b_cols, b_rows)], chart)


def purchases_report(ctx: AppContext, user: dict, p: dict) -> dict:
    start, end = _default_month(p)
    names = _names(ctx)
    items = [x for x in analytics.purchases_in(ctx, start, end) if not p.get("vendor_id") or x["vendor_id"] == p["vendor_id"]]
    cols = [C("date", "Date", "date"), C("id", "Purchase"), C("vendor", "Vendor"), C("invoice", "Invoice no."), C("location", "Location"),
            C("pieces", "Pieces", "int"), C("total", "Total", "money")]
    rows = [{"date": x["purchase_date"], "id": x["id"], "vendor": x.get("vendor_name", ""), "invoice": x.get("invoice_number", ""),
             "location": names["locations"].get(x["location_id"], ""), "pieces": sum(i["quantity"] for i in x["items"]), "total": x["total"]}
            for x in sorted(items, key=lambda x: (x["purchase_date"], x["id"]))]
    v: dict[str, Row] = {}
    for r in rows:
        e = v.setdefault(r["vendor"] or "(no vendor)", {"vendor": r["vendor"] or "(no vendor)", "purchases": 0, "pieces": 0, "total": Decimal("0")})
        e["purchases"] += 1
        e["pieces"] += r["pieces"]
        e["total"] += D(r["total"])
    vcols = [C("vendor", "Vendor"), C("purchases", "Purchases", "int"), C("pieces", "Pieces", "int"), C("total", "Total", "money")]
    vrows = [{**e, "total": f(e["total"])} for e in sorted(v.values(), key=lambda e: e["total"], reverse=True)]
    chart = {"kind": "pie", "title": "Purchases by vendor", "data": [{"label": r["vendor"], "value": r["total"]} for r in vrows]}
    return _report("purchases", "Purchase Report", f"{start} to {end}", {"start": start, "end": end, "vendor_id": p.get("vendor_id", "")},
                   [S("Purchases", len(rows), "int"), S("Pieces bought", sum(r["pieces"] for r in rows), "int"), S("Total purchase value", f(dsum(r["total"] for r in rows)))],
                   [section("Purchases", cols, rows), section("By vendor", vcols, vrows)], chart,
                   ["Inventory purchases are stock for resale. They are NOT operating expenses - see the Expense Report for running costs."])


# ------------------------------------------------------------------ EXPENSE + PROFIT
def _group_expenses(exps: list[dict], key_fn, key_col: str, label: str, total: Decimal) -> dict:
    g: dict[str, list] = {}
    for e in exps:
        r = g.setdefault(key_fn(e) or "(none)", [0, Decimal("0")])
        r[0] += 1
        r[1] += D(e["amount"])
    cols = [C(key_col, label), C("count", "Entries", "int"), C("amount", "Amount", "money"), C("percent", "Share %", "percent")]
    rows = [{key_col: k, "count": c, "amount": f(a), "percent": round(float(a * 100 / total), 1) if total else 0}
            for k, (c, a) in sorted(g.items(), key=lambda kv: kv[1][1], reverse=True)]
    sec = section(f"By {label.lower()}", cols, rows)
    if sec["totals"]:
        sec["totals"]["percent"] = 100 if total else 0
    return sec


def expenses_report(ctx: AppContext, user: dict, p: dict) -> dict:
    start, end = _default_month(p)
    exps = [e for e in analytics.expenses_in(ctx, start, end)
            if (not p.get("category_id") or e["category_id"] == p["category_id"])
            and (not p.get("payment_method") or e["payment_method"] == p["payment_method"])
            and (not p.get("payee") or p["payee"].lower() in (e.get("payee") or "").lower())]
    total = dsum(e["amount"] for e in exps)
    cols = [C("date", "Date", "date"), C("category", "Category"), C("description", "Description"), C("payee", "Vendor / Payee"), C("amount", "Amount", "money"),
            C("method", "Payment"), C("reference", "Reference"), C("by", "Added by")]
    rows = [{"date": e["expense_date"], "category": e["category_name"], "description": e["description"], "payee": e.get("payee", ""), "amount": e["amount"],
             "method": e["payment_method"], "reference": e.get("reference_no", ""), "by": e.get("created_by_name", "")}
            for e in sorted(exps, key=lambda e: (e["expense_date"], e["created_at"]))]
    by_cat = _group_expenses(exps, lambda e: e["category_name"], "category", "Category", total)
    span = (parse_date(end) - parse_date(start)).days if start and end else 0
    if span > 62:
        time_sec = _group_expenses(exps, lambda e: e["expense_date"][:7], "month", "Month", total)
    else:
        time_sec = _group_expenses(exps, lambda e: e["expense_date"], "day", "Day", total)
    n_cancel = len([e for e in ctx.store.all("expenses") if e["status"] == "cancelled" and in_range(e["expense_date"], start, end)])
    chart = {"kind": "pie", "title": "Expenses by category", "data": [{"label": r["category"], "value": r["amount"]} for r in by_cat["rows"]]}
    top = by_cat["rows"][0]["category"] if by_cat["rows"] else "-"
    summary = [S("Total expenses", f(total), tone="bad"), S("Entries", len(rows), "int"), S("Largest category", top, "text")]
    if rows:
        summary.append(S("Average per entry", f(total / len(rows))))
    return _report("expenses", "Expense Report", f"{start} to {end}", {"start": start, "end": end, "category_id": p.get("category_id", ""), "payment_method": p.get("payment_method", ""), "payee": p.get("payee", "")},
                   summary, [section("Expenses", cols, rows), by_cat, _group_expenses(exps, lambda e: e.get("payee"), "payee", "Vendor / Payee", total),
                             _group_expenses(exps, lambda e: e["payment_method"], "method", "Payment method", total), time_sec], chart,
                   ([f"{n_cancel} cancelled expense(s) are not included."] if n_cancel else []))


def profitability(ctx: AppContext, user: dict, p: dict) -> dict:
    start, end = _default_month(p)
    fg = analytics.profit_figures(ctx, start, end)
    margin = round(float(D(fg["gross_profit"]) * 100 / D(fg["revenue"])), 1) if fg["revenue"] else 0
    summary = [S("Gross sales", fg["gross"]), S("Discounts given", fg["discount"]), S("Net sales (Revenue)", fg["revenue"], hint="Net sales without tax"),
               S("Estimated cost of goods sold", fg["cogs"], hint="Purchase cost of the pieces sold"),
               S("Estimated gross profit", fg["gross_profit"], tone="good" if fg["gross_profit"] >= 0 else "bad"),
               S("Operating expenses", fg["operating_expenses"], hint="Rent, bags, marketing... (not inventory purchases)"),
               S("Estimated net operating result", fg["net_result"], tone="good" if fg["net_result"] >= 0 else "bad"),
               S("Gross margin %", margin, "percent"),
               S("Inventory purchases in period", fg["purchases"], hint="For information only - not deducted, stock is an asset until sold")]
    months = analytics.last_months(1)
    if start and end:
        months = []
        d = parse_date(start).replace(day=1)
        stop = parse_date(end)
        while d <= stop:
            months.append(d.strftime("%Y-%m"))
            d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    cols = [C("month", "Month"), C("revenue", "Net sales", "money"), C("cogs", "Est. cost of goods", "money"), C("gross_profit", "Est. gross profit", "money"),
            C("expenses", "Operating expenses", "money"), C("net", "Est. net result", "money")]
    rows = []
    for ym in months[:60]:
        ms, me = analytics.month_bounds(ym)
        ms, me = max(ms, start), min(me, end)
        x = analytics.profit_figures(ctx, ms, me)
        rows.append({"month": ym, "revenue": x["revenue"], "cogs": x["cogs"], "gross_profit": x["gross_profit"], "expenses": x["operating_expenses"], "net": x["net_result"]})
    chart = {"kind": "bar", "title": "Estimated net result per month", "data": [{"label": r["month"], "value": r["net"]} for r in rows]}
    exps = analytics.expenses_in(ctx, start, end)
    return _report("profitability", "Profitability (Estimated)", f"{start} to {end}", {"start": start, "end": end}, summary,
                   [section("Month by month", cols, rows), _group_expenses(exps, lambda e: e["category_name"], "category", "Category", dsum(e["amount"] for e in exps))], chart,
                   ["All profit figures are ESTIMATES for business management - not formal accounting.",
                    "Cost of goods sold uses each piece's average purchase cost at the time it was sold.",
                    "Inventory purchases are not treated as expenses. They turn into cost only when the pieces are sold."])


# ------------------------------------------------------------------ registry
REPORTS: dict[str, dict] = {
    "daily_sales": {"title": "Daily Sales", "perm": "reports.daily_sales", "fn": daily_sales, "inputs": ["date"]},
    "monthly_sales": {"title": "Monthly Sales", "perm": "reports.monthly_sales", "fn": monthly_sales, "inputs": ["year_month"]},
    "product_sales": {"title": "Product Sales", "perm": "reports.sales_detail", "fn": product_sales, "inputs": ["range"]},
    "category_sales": {"title": "Category Sales", "perm": "reports.sales_detail", "fn": category_sales, "inputs": ["range"]},
    "staff_sales": {"title": "Staff Sales", "perm": "reports.sales_detail", "fn": staff_sales, "inputs": ["range"]},
    "payment_report": {"title": "Payment Report", "perm": "reports.sales_detail", "fn": payment_report, "inputs": ["range"]},
    "inventory": {"title": "Inventory Report", "perm": "reports.inventory", "fn": inventory_report, "inputs": ["category", "vendor", "location", "stock_status", "q"]},
    "old_stock": {"title": "Old Stock Report", "perm": "reports.old_stock", "fn": old_stock, "inputs": ["days"]},
    "purchases": {"title": "Purchase Report", "perm": "reports.purchases", "fn": purchases_report, "inputs": ["range", "vendor"]},
    "expenses": {"title": "Expense Report", "perm": "reports.expenses", "fn": expenses_report, "inputs": ["range", "category", "payment_method", "payee"]},
    "profitability": {"title": "Profitability", "perm": "reports.profitability", "fn": profitability, "inputs": ["range"]},
}


def build(ctx: AppContext, user: dict, key: str, params: dict) -> dict:
    spec = REPORTS.get(key)
    if spec is None:
        raise ValidationFailed("Unknown report.")
    return spec["fn"](ctx, user, {k: v for k, v in params.items() if v not in (None, "")})
