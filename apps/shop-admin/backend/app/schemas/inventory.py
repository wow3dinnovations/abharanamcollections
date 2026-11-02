from __future__ import annotations

from typing import Optional

from pydantic import Field

from app.schemas.common import Body


class ProductIn(Body):
    name: str
    category_id: str
    subcategory_id: str = ""
    sku: str = ""
    barcode: str = ""
    description: str = ""
    design_number: str = ""
    size: str = ""
    colour: str = ""
    material: str = ""
    collection: str = ""
    tags: list[str] | str = []
    vendor_id: str = ""
    purchase_location_id: str = ""
    purchase_date: str = ""
    purchase_invoice_no: str = ""
    purchase_rate: float = 0
    selling_price: float
    discount_allowed_percent: Optional[float] = None
    min_selling_price: Optional[float] = None
    initial_quantity: int = 0
    rack: str = ""


class ProductUpdateIn(Body):
    name: Optional[str] = None
    category_id: Optional[str] = None
    subcategory_id: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    description: Optional[str] = None
    design_number: Optional[str] = None
    size: Optional[str] = None
    colour: Optional[str] = None
    material: Optional[str] = None
    collection: Optional[str] = None
    tags: Optional[list[str] | str] = None
    vendor_id: Optional[str] = None
    purchase_invoice_no: Optional[str] = None
    purchase_rate: Optional[float] = None
    selling_price: Optional[float] = None
    discount_allowed_percent: Optional[float] = None
    min_selling_price: Optional[float] = None
    rack: Optional[str] = None
    status: Optional[str] = None


class AdjustIn(Body):
    product_id: str
    location_id: str
    quantity_change: int
    reason_type: str = "STOCK_ADJUSTMENT"
    remarks: str = ""


class AddStockIn(Body):
    product_id: str
    location_id: str
    quantity: int
    kind: str = "PURCHASE"                # PURCHASE | OTHER
    purchase_rate: Optional[float] = None
    vendor_id: str = ""
    remarks: str = ""


class SetQuantityIn(Body):
    product_id: str
    location_id: str
    new_quantity: int
    reason: str = "COUNT_CORRECTION"      # COUNT_CORRECTION | DAMAGE | LOST | OTHER
    remarks: str = ""


class TransferItemIn(Body):
    product_id: str
    quantity: int


class TransferIn(Body):
    from_location_id: str
    to_location_id: str
    items: list[TransferItemIn]
    remarks: str = ""


class PurchaseItemIn(Body):
    product_id: str
    quantity: int
    rate: float


class PurchaseIn(Body):
    vendor_id: str = ""
    location_id: str = ""
    purchase_date: str = ""
    invoice_number: str = ""
    notes: str = ""
    items: list[PurchaseItemIn] = Field(default_factory=list)


class PurchaseUpdateIn(Body):
    vendor_id: Optional[str] = None
    location_id: Optional[str] = None
    purchase_date: Optional[str] = None
    invoice_number: Optional[str] = None
    notes: Optional[str] = None
    items: Optional[list[PurchaseItemIn]] = None
