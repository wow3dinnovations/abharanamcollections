"""Money helpers.  All maths uses Decimal; values are stored as 2-decimal floats."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable

TWO = Decimal("0.01")


def D(value) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def q(value) -> Decimal:
    """Round to paise."""
    return D(value).quantize(TWO, rounding=ROUND_HALF_UP)


def f(value) -> float:
    """Decimal -> 2dp float for storage / JSON."""
    return float(q(value))


def dsum(values: Iterable) -> Decimal:
    total = Decimal("0")
    for v in values:
        total += D(v)
    return total


def fsum(values: Iterable) -> float:
    return f(dsum(values))


def format_inr(value, symbol: str = "₹", decimals: int = 2) -> str:
    """Indian digit grouping:  125000 -> ₹1,25,000.00"""
    v = q(value) if decimals == 2 else D(value)
    neg = v < 0
    text = f"{abs(v):.{decimals}f}"
    whole, _, frac = text.partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return f"{'-' if neg else ''}{symbol}{whole}" + (f".{frac}" if decimals else "")
