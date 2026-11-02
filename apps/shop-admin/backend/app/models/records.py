"""Shapes of the records stored in the JSON files.

These pydantic models are used to VALIDATE records before they are saved (and by the
Data Health check).  ``extra="allow"`` keeps files forward compatible.
"""
from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

SKU_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-]{1,39}$")


class Rec(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str = Field(min_length=1)


class User(Rec):
    username: str = Field(min_length=3, max_length=60)
    full_name: str = ""
    email: str = ""
    password_hash: str = Field(min_length=10)
    role: Literal["admin", "staff"]
    permissions: list[str] = []
    active: bool = True
    token_version: int = 0
    max_discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    max_discount_amount: Optional[float] = Field(default=None, ge=0)


class Role(Rec):
    name: str = Field(min_length=1)
    permissions: list[str] = []


class Category(Rec):
    name: str = Field(min_length=1)
    code: str = Field(min_length=2, max_length=6)
    active: bool = True


class Subcategory(Rec):
    name: str = Field(min_length=1)
    category_id: str
    active: bool = True


class ExpenseCategory(Rec):
    name: str = Field(min_length=1)
    active: bool = True


class Vendor(Rec):
    name: str = Field(min_length=1)
    active: bool = True


class Location(Rec):
    name: str = Field(min_length=1)
    active: bool = True


class Customer(Rec):
    name: str = Field(min_length=1)
    mobile: str = ""


class Product(Rec):
    sku: str
    barcode: str
    name: str = Field(min_length=1)
    category_id: str
    purchase_rate: float = Field(ge=0)
    selling_price: float = Field(ge=0)
    min_selling_price: Optional[float] = Field(default=None, ge=0)
    discount_allowed_percent: Optional[float] = Field(default=None, ge=0, le=100)
    initial_quantity: int = Field(ge=0)
    sold_quantity: int = Field(ge=0)
    stock: dict[str, int]
    status: Literal["active", "inactive", "deleted"] = "active"
    date_added: str

    @field_validator("sku", "barcode")
    @classmethod
    def _code_ok(cls, v: str) -> str:
        if not SKU_RE.match(v):
            raise ValueError("must be 2-40 letters, digits, '.', '_' or '-'")
        return v

    @field_validator("stock")
    @classmethod
    def _stock_ok(cls, v: dict[str, int]) -> dict[str, int]:
        for loc, qty in v.items():
            if qty < 0:
                raise ValueError(f"negative stock at {loc}")
        return v


class InventoryTransaction(Rec):
    date_time: str
    product_id: str
    location_id: str
    type: Literal["PURCHASE", "SALE", "SALE_RETURN", "STOCK_ADJUSTMENT", "STOCK_TRANSFER",
                  "DAMAGE", "LOST", "OTHER", "SALE_CANCELLED"]
    quantity: int
    previous_stock: int = Field(ge=0)
    new_stock: int = Field(ge=0)


class PurchaseItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    product_id: str
    quantity: int = Field(gt=0)
    rate: float = Field(ge=0)
    total: float = Field(ge=0)


class Purchase(Rec):
    purchase_date: str
    location_id: str
    items: list[PurchaseItem] = Field(min_length=1)
    total: float = Field(ge=0)


class SaleItem(BaseModel):
    model_config = ConfigDict(extra="allow")
    product_id: str
    sku: str
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0)
    discount_amount: float = Field(ge=0)
    line_total: float = Field(ge=0)
    unit_cost: float = Field(ge=0)


class PaymentPart(BaseModel):
    model_config = ConfigDict(extra="allow")
    method: str
    amount: float = Field(ge=0)


class Sale(Rec):
    invoice_number: str
    date_time: str
    items: list[SaleItem] = Field(min_length=1)
    subtotal: float = Field(ge=0)
    discount_amount: float = Field(ge=0)
    total: float = Field(ge=0)
    payments: list[PaymentPart]
    status: Literal["completed", "cancelled"]


class Payment(Rec):
    sale_id: str
    method: str
    amount: float = Field(ge=0)


class Expense(Rec):
    expense_date: str
    category_id: str
    description: str = Field(min_length=1)
    amount: float = Field(gt=0)
    status: Literal["active", "cancelled"] = "active"


class StockTransfer(Rec):
    from_location_id: str
    to_location_id: str


class AuditLog(Rec):
    timestamp: str
    action: str
