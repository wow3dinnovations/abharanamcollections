"""Dashboard numbers - all calculated from the real data files, nothing is hard-coded."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.core.context import AppContext
from app.services import analytics, inventory_service, product_service, settings_service
from app.utils.dates import date_of, product_age_days, today_iso
from app.utils.money import D, dsum, f


def _has(user: dict, *perms: str) -> bool:
    return user["role"] == "admin" or any(p in user.get("permissions", []) for p in perms)


def build(ctx: AppContext, user: dict) -> dict:
    t = date.today()
    today = t.isoformat()
    month_start, month_end = analytics.month_bounds(today[:7])
    cfg = settings_service.get(ctx)
    inv_cfg = cfg["inventory"]
    out: dict = {"date": today, "month": today[:7], "sections": []}

    # ---------------------------------------------------------------- sales
    if _has(user, "sales.view", "reports.daily_sales", "reports.monthly_sales", "reports.sales_detail", "reports.profitability"):
        month_sales = analytics.sales_in(ctx, month_start, month_end)
        today_sales = [s for s in month_sales if date_of(s["date_time"]) == today]
        ta, ma = analytics.aggregate(today_sales), analytics.aggregate(month_sales)
        out["today"] = {"total_sales": ta["net"], "bills": ta["bills"], "items": ta["items"], "gross": ta["gross"], "discount": ta["discount"], "net": ta["net"], "total_billed": ta["total"]}
        out["month_sales"] = {"sales": ma["net"], "bills": ma["bills"], "items": ma["items"], "gross": ma["gross"], "discount": ma["discount"], "net": ma["net"]}
        # charts
        daily = analytics.last_days(30)
        by_day = analytics.group_sum(analytics.sales_in(ctx, daily[0], today), lambda s: date_of(s["date_time"]), lambda s: s.get("net_amount", s["subtotal"]))
        out["chart_daily_sales"] = [{"label": d[8:] + "/" + d[5:7], "value": f(by_day.get(d, 0))} for d in daily]
        months = analytics.last_months(12)
        m_start = analytics.month_bounds(months[0])[0]
        by_month = analytics.group_sum(analytics.sales_in(ctx, m_start, today), lambda s: s["date_time"][:7], lambda s: s.get("net_amount", s["subtotal"]))
        out["chart_monthly_sales"] = [{"label": m, "value": f(by_month.get(m, 0))} for m in months]
        cats = {c["id"]: c["name"] for c in ctx.store.all("categories")}
        by_cat = analytics.group_sum([i for s in month_sales for i in s["items"]], lambda i: cats.get(i.get("category_id", ""), "(unknown)"), lambda i: i["line_total"])
        out["chart_category_sales"] = sorted(({"label": k, "value": f(v)} for k, v in by_cat.items()), key=lambda r: -r["value"])
        pay: dict[str, Decimal] = {}
        for p in ctx.store.all("payments"):
            if p["status"] == "received" and month_start <= date_of(p["date_time"]) <= month_end:
                pay[p["method"]] = pay.get(p["method"], Decimal("0")) + D(p["amount"])
        out["chart_payment_methods"] = [{"label": k, "value": f(v)} for k, v in sorted(pay.items())]

    # ---------------------------------------------------------------- inventory
    if _has(user, "inventory.view"):
        prods = [p for p in ctx.store.all("products") if p["status"] != "deleted"]
        qty = [inventory_service.total_stock(p) for p in prods]
        low = inv_cfg["low_stock_threshold"]
        old_days = inv_cfg["old_stock_days"]
        out["inventory"] = {
            "total_products": len(prods), "total_stock": sum(qty), "out_of_stock": sum(1 for q in qty if q == 0),
            "low_stock": sum(1 for q in qty if 0 < q <= low),
            "old_stock": sum(1 for p, q in zip(prods, qty) if q > 0 and product_age_days(p["date_added"]) > old_days),
            "old_stock_days": old_days, "low_stock_threshold": low}
        names = {c["id"]: c["name"] for c in ctx.store.all("categories")}
        by_cat: dict[str, list] = {}
        for p, q in zip(prods, qty):
            e = by_cat.setdefault(names.get(p["category_id"], "(unknown)"), [0, Decimal("0")])
            e[0] += q
            e[1] += D(p["purchase_rate"]) * q
        show_value = product_service.can_see_cost(user)
        out["chart_inventory_by_category"] = [{"label": k, "value": v[0], **({"cost": f(v[1])} if show_value else {})} for k, v in sorted(by_cat.items())]
        if show_value:
            out["inventory"]["stock_value"] = f(sum(D(p["purchase_rate"]) * q for p, q in zip(prods, qty)))
        recent = sorted(prods, key=lambda p: p["date_added"], reverse=True)[:6]
        out["recent_products"] = [{"id": p["id"], "name": p["name"], "sku": p["sku"], "selling_price": p["selling_price"],
                                   "quantity": inventory_service.total_stock(p), "date_added": p["date_added"],
                                   "image_url": f"/api/files/products/{p['image'].split('/')[-1]}?v={p.get('image_version', 0)}" if p.get("image") else None} for p in recent]

    # ---------------------------------------------------------------- expenses
    if _has(user, "expenses.view", "reports.expenses", "reports.profitability"):
        m_exp = analytics.expenses_in(ctx, month_start, month_end)
        cat_totals = analytics.group_sum(m_exp, lambda e: e["category_name"], lambda e: e["amount"])
        out["expenses"] = {"today": f(dsum(e["amount"] for e in m_exp if e["expense_date"] == today)), "month": f(dsum(e["amount"] for e in m_exp)),
                           "top_categories": [{"label": k, "value": f(v)} for k, v in sorted(cat_totals.items(), key=lambda kv: -kv[1])[:5]]}
        out["chart_expense_categories"] = [{"label": k, "value": f(v)} for k, v in sorted(cat_totals.items(), key=lambda kv: -kv[1])]
        months = analytics.last_months(12)
        by_m = analytics.group_sum(analytics.expenses_in(ctx, analytics.month_bounds(months[0])[0], today), lambda e: e["expense_date"][:7], lambda e: e["amount"])
        out["chart_monthly_expenses"] = [{"label": m, "value": f(by_m.get(m, 0))} for m in months]

    # ---------------------------------------------------------------- profit view
    if _has(user, "reports.profitability"):
        fg = analytics.profit_figures(ctx, month_start, month_end)
        out["profit"] = {"sales": fg["revenue"], "cogs": fg["cogs"], "gross_profit": fg["gross_profit"], "operating_expenses": fg["operating_expenses"],
                         "net_result": fg["net_result"], "purchases": fg["purchases"], "estimated": True}
    elif _has(user, "purchases.view"):
        out["purchase_value_month"] = f(dsum(p["total"] for p in analytics.purchases_in(ctx, month_start, month_end)))
    out["today_iso"] = today_iso()
    return out
