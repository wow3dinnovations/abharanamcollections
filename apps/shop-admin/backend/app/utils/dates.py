"""Date helpers.  The shop runs in local time; dates are stored as ISO text."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from app.core.errors import ValidationFailed

AGE_BUCKETS = [(30, "0-30 Days"), (60, "31-60 Days"), (90, "61-90 Days"),
               (180, "91-180 Days"), (365, "181-365 Days")]


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


def now_iso() -> str:
    return now().isoformat(timespec="seconds")


def today() -> date:
    return date.today()


def today_iso() -> str:
    return today().isoformat()


def parse_date(value, field: str = "date") -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not value:
        raise ValidationFailed(f"{field} is required.")
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        raise ValidationFailed(f"{field} '{text}' is not a valid date (use YYYY-MM-DD).")


def date_of(iso_text: str) -> str:
    """'2026-09-19T10:30:00' -> '2026-09-19'"""
    return (iso_text or "")[:10]


def product_age_days(date_added: str, on: date | None = None) -> int:
    on = on or today()
    d = parse_date(date_of(date_added), "date added")
    return max((on - d).days, 0)


def age_bucket(days: int) -> str:
    for limit, label in AGE_BUCKETS:
        if days <= limit:
            return label
    return "365+ Days"


def age_months(days: int) -> float:
    return round(days / 30.4375, 1)


def month_range(year: int, month: int) -> tuple[str, str]:
    start = date(year, month, 1)
    end = date(year + (month == 12), (month % 12) + 1, 1) - timedelta(days=1)
    return start.isoformat(), end.isoformat()


def in_range(day: str, start: str | None, end: str | None) -> bool:
    if start and day < start:
        return False
    if end and day > end:
        return False
    return True
