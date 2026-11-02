"""Shared number-crunching for the dashboard and reports.  Everything comes from the real data files.

Definitions (also explained on screen):
  Gross sales      = value of items at selling price, before discount
  Discount         = discounts given on bills
  Net sales        = gross sales - discount                     (tax not included)
  Revenue          = net sales without tax (what the shop actually keeps)
  COGS (estimated) = purchase cost of the pieces sold (cost at the time of the sale)
  Gross profit     = revenue - COGS                             (estimated)
  Net result       = gross profit - operating expenses          (estimated)
Inventory purchases are NOT operating expenses; they only matter through COGS when the pieces are sold.
"""
from __future__ import annotations

from bisect import bisect_left, bisect_right
from datetime import date, timedelta
from decimal import Decimal
from typing import Iterable

from app.core.context import AppContext
from app.utils.dates import date_of, in_range, month_range
from app.utils.money import D, dsum, f


def _day_index(rows: list[dict], key_fn) -> tuple[list[str], dict[str, list[dict]]]:
    by_day: dict[str, list[dict]] = {}
    for r in rows:
        by_day.setdefault(key_fn(r), []).append(r)
    return sorted(by_day), by_day


def _in_days(days: list[str], by_day: dict[str, list[dict]], start: str | None, end: str | None) -> list[dict]:
    lo = bisect_left(days, start) if start else 0
    hi = bisect_right(days, end) if end else len(days)
    return [r for d in days[lo:hi] for r in by_day[d]]


def sales_in(ctx: AppContext, start: str | None, end: str | None, status: str = "completed") -> list[dict]:
    days, by_day = ctx.store.derived("sales", "by_day", lambda rows: _day_index(rows, lambda s: date_of(s["date_time"])))
    rows = _in_days(days, by_day, start, end)
    return [s for s in rows if not status or s["status"] == status]


def expenses_in(ctx: AppContext, start: str | None, end: str | None) -> list[dict]:
    days, by_day = ctx.store.derived("expenses", "by_day", lambda rows: _day_index(rows, lambda e: e["expense_date"]))
    return [e for e in _in_days(days, by_day, start, end) if e["status"] == "active"]


def purchases_in(ctx: AppContext, start: str | None, end: str | None) -> list[dict]:
    days, by_day = ctx.store.derived("purchases", "by_day", lambda rows: _day_index(rows, lambda p: p["purchase_date"]))
    return _in_days(days, by_day, start, end)


def _p(v) -> int:
    """Rupees -> whole paise (exact for 2-decimal money, and much faster than Decimal)."""
    return round(float(v or 0) * 100)


def aggregate(sales: Iterable[dict]) -> dict:
    bills = items = 0
    gross = disc = net = tax = total = revenue = cogs = 0          # all in paise (whole numbers)
    for s in sales:
        bills += 1
        items += s.get("item_count") or sum(i["quantity"] for i in s["items"])
        g, d = _p(s["subtotal"]), _p(s["discount_amount"])
        gross += g
        disc += d
        n = _p(s["net_amount"]) if "net_amount" in s else g - d
        net += n
        tax += _p(s.get("tax_amount", 0))
        total += _p(s["total"])
        revenue += _p(s["taxable_value"]) if "taxable_value" in s else n
        for i in s["items"]:
            cogs += _p(i["unit_cost"]) * i["quantity"]
    to = lambda p: f(Decimal(p) / 100)                               # noqa: E731
    return {"bills": bills, "items": items, "gross": to(gross), "discount": to(disc), "net": to(net), "tax": to(tax),
            "total": to(total), "revenue": to(revenue), "cogs": to(cogs), "gross_profit": to(revenue - cogs)}


def profit_figures(ctx: AppContext, start: str | None, end: str | None) -> dict:
    agg = aggregate(sales_in(ctx, start, end))
    opex = dsum(e["amount"] for e in expenses_in(ctx, start, end))
    purchases = dsum(p["total"] for p in purchases_in(ctx, start, end))
    return {**agg, "operating_expenses": f(opex), "purchases": f(purchases),
            "net_result": f(D(agg["gross_profit"]) - opex)}


def month_key(day: str) -> str:
    return day[:7]


def last_months(n: int, today: date | None = None) -> list[str]:
    """['2025-10', ..., '2026-09'] oldest first, ending with the current month."""
    t = today or date.today()
    y, m = t.year, t.month
    out = []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def last_days(n: int, today: date | None = None) -> list[str]:
    t = today or date.today()
    return [(t - timedelta(days=i)).isoformat() for i in range(n - 1, -1, -1)]


def month_bounds(ym: str) -> tuple[str, str]:
    y, m = int(ym[:4]), int(ym[5:7])
    return month_range(y, m)


def group_sum(rows: Iterable[dict], key_fn, val_fn) -> dict:
    out: dict = {}
    for r in rows:
        k = key_fn(r)
        out[k] = out.get(k, 0) + _p(val_fn(r))
    return {k: Decimal(v) / 100 for k, v in out.items()}
