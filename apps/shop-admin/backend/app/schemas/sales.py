from __future__ import annotations

from typing import Optional

from pydantic import Field

from app.schemas.common import Body


class CartItemIn(Body):
    product_id: str
    quantity: int = 1


class PaymentIn(Body):
    method: str
    amount: float
    reference: str = ""


class CustomerInline(Body):
    name: str = ""
    mobile: str = ""
    email: str = ""
    address: str = ""


class SaleIn(Body):
    location_id: str = ""          # blank / "ALL" = sell from any location (the normal way)
    items: list[CartItemIn] = Field(default_factory=list)
    customer_id: str = ""
    customer: Optional[CustomerInline] = None
    discount_type: Optional[str] = None          # "percent" | "amount"
    discount_value: float = 0
    payment_method: str = ""
    payments: list[PaymentIn] = Field(default_factory=list)
    notes: str = ""


class CancelIn(Body):
    reason: str = ""


class CustomerIn(Body):
    name: str = ""
    mobile: str = ""
    email: str = ""
    address: str = ""
    notes: str = ""


class CustomerUpdateIn(Body):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None
