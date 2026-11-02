"""Application settings (data/settings.json) and the business logo."""
from __future__ import annotations

import copy
import re
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.core.context import AppContext
from app.core.errors import ValidationFailed
from app.models.settings import merge_settings
from app.services import audit_service

LOGO_EXTS = {".png", ".jpg", ".jpeg", ".svg", ".webp"}
MAX_LOGO_BYTES = 3 * 1024 * 1024


class _Base(BaseModel):
    model_config = ConfigDict(extra="allow")


class LabelSize(_Base):
    id: str = Field(pattern=r"^[A-Za-z0-9_\-x.]{1,20}$")
    name: str = Field(min_length=1)
    width_mm: float = Field(gt=5, le=300)
    height_mm: float = Field(gt=5, le=300)


class Business(_Base):
    name: str = Field(min_length=1, max_length=100)
    tagline: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    gstin: str = ""
    currency: str = "INR"
    currency_symbol: str = "₹"
    date_format: str = "DD/MM/YYYY"


class Inventory(_Base):
    sku_prefix: str = Field(pattern=r"^[A-Za-z0-9]{1,8}$")
    low_stock_threshold: int = Field(ge=0, le=100000)
    old_stock_days: int = Field(ge=1, le=3650)
    default_location_id: str = ""
    barcode_symbology: str = "code128"
    barcode_mode: str = Field(default="short", pattern="^(sku|short)$")
    short_barcode_digits: int = Field(default=6, ge=6, le=12)
    barcode_module_mm: float = Field(default=0, ge=0, le=1)
    label_size_id: str = "30x50"
    label_sizes: list[LabelSize]


class Billing(_Base):
    invoice_prefix: str = Field(pattern=r"^[A-Za-z0-9\-]{0,10}$")
    starting_invoice_number: int = Field(ge=1)
    payment_methods: list[str] = Field(min_length=1)
    default_payment_method: str = "Cash"
    invoice_footer: str = ""
    tax_enabled: bool = False
    tax_label: str = "GST"
    tax_rate: float = Field(ge=0, le=100)
    tax_mode: str = Field(pattern="^(exclusive|inclusive)$")
    staff_can_discount: bool = True
    staff_max_discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    staff_max_discount_amount: Optional[float] = Field(default=None, ge=0)


class Expenses(_Base):
    default_payment_method: str = "Cash"


class Printer(_Base):
    name: str = ""
    model: str = ""
    connection: str = ""
    label_size_id: str = "30x50"
    copies: int = Field(default=1, ge=1, le=100)
    rotate: bool = False


class SettingsModel(_Base):
    business: Business
    inventory: Inventory
    billing: Billing
    expenses: Expenses
    printer: Printer


def get(ctx: AppContext) -> dict:
    return merge_settings(ctx.store.doc("settings"))


def public(ctx: AppContext) -> dict:
    """What the login page may show (no private details)."""
    b = get(ctx)["business"]
    return {"name": b["name"], "tagline": b["tagline"], "has_logo": find_logo(ctx) is not None}


def _deep_merge(base: dict, patch: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k != "label_sizes":
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def update(ctx: AppContext, user: dict, patch: dict) -> dict:
    patch = {k: v for k, v in patch.items() if k in ("business", "inventory", "billing", "expenses", "printer")}
    current = get(ctx)
    merged = _deep_merge(current, patch)
    try:
        SettingsModel.model_validate(merged)
    except ValidationError as exc:
        e = exc.errors()[0]
        raise ValidationFailed(f"Invalid setting '{'.'.join(str(p) for p in e['loc'])}': {e['msg']}")
    b = merged["billing"]
    if b["default_payment_method"] not in b["payment_methods"]:
        raise ValidationFailed("The default payment method must be one of the payment methods.")
    ids = [s["id"] for s in merged["inventory"]["label_sizes"]]
    if len(ids) != len(set(ids)):
        raise ValidationFailed("Label size ids must be unique.")
    if merged["inventory"]["label_size_id"] not in ids:
        raise ValidationFailed("The selected label size does not exist.")
    mod = merged["inventory"].get("barcode_module_mm", 0)
    if mod and mod < 0.08:
        raise ValidationFailed("The thinnest bar must be at least 0.08 mm (or 0 to fit automatically).")
    loc = merged["inventory"].get("default_location_id")
    if loc and ctx.store.get("locations", loc) is None:
        raise ValidationFailed("The default location does not exist.")
    changed = sorted(k for k in patch if merged[k] != current[k])
    with ctx.store.transaction() as tx:
        doc = tx.doc("settings")
        doc.clear()
        doc.update(merged)
        if "billing" in changed and "starting_invoice_number" in patch.get("billing", {}):
            # only affects numbering if no invoice has been issued yet
            if not ctx.store.all("sales"):
                tx.doc("counters")["invoice"] = int(merged["billing"]["starting_invoice_number"]) - 1
        audit_service.record(tx, user, "SETTINGS_CHANGED", "settings", "settings",
                             f"Changed: {', '.join(changed) or 'nothing'}")
    return merged


# ------------------------------------------------------------------ logo
def find_logo(ctx: AppContext) -> Path | None:
    d = ctx.settings.logo_dir
    if not d.exists():
        return None
    for name in sorted(d.iterdir()):
        if name.is_file() and name.suffix.lower() in LOGO_EXTS and name.stem.lower().startswith("logo"):
            return name
    for name in sorted(d.iterdir()):
        if name.is_file() and name.suffix.lower() in LOGO_EXTS:
            return name
    return None


def save_logo(ctx: AppContext, user: dict, filename: str, content: bytes) -> str:
    ext = Path(filename or "").suffix.lower()
    if ext not in LOGO_EXTS:
        raise ValidationFailed("The logo must be a PNG, JPG, SVG or WEBP picture.")
    if len(content) > MAX_LOGO_BYTES:
        raise ValidationFailed("The logo file is too big (maximum 3 MB).")
    if not content:
        raise ValidationFailed("The logo file is empty.")
    if ext == ".svg" and re.search(rb"<script|onload\s*=|javascript:", content, re.I):
        raise ValidationFailed("This SVG file contains active code and cannot be used.")
    d = ctx.settings.logo_dir
    d.mkdir(parents=True, exist_ok=True)
    for old in d.iterdir():
        if old.is_file() and old.stem.lower() == "logo":
            old.unlink()
    (d / f"logo{ext}").write_bytes(content)
    audit_service.log_now(ctx, user, "SETTINGS_CHANGED", "settings", "logo", "Logo replaced")
    return f"logo{ext}"
