"""Default application settings (stored in data/settings.json)."""
from __future__ import annotations

import copy

DEFAULT_LABEL_SIZES = [
    {"id": "12x18", "name": "12mm x 18mm", "width_mm": 18, "height_mm": 12},
    {"id": "25x50", "name": "25mm x 50mm", "width_mm": 50, "height_mm": 25},
    {"id": "30x50", "name": "30mm x 50mm", "width_mm": 50, "height_mm": 30},
    {"id": "40x60", "name": "40mm x 60mm", "width_mm": 60, "height_mm": 40},
]

DEFAULT_SETTINGS: dict = {
    "business": {
        "name": "ABHARANAM COLLECTIONS",
        "tagline": "Timeless Beauty, Precious You",
        "address": "",
        "phone": "",
        "email": "",
        "gstin": "",
        "currency": "INR",
        "currency_symbol": "₹",
        "date_format": "DD/MM/YYYY",
    },
    "inventory": {
        "sku_prefix": "ABH",
        "low_stock_threshold": 3,
        "old_stock_days": 90,
        "default_location_id": "",
        "barcode_symbology": "code128",
        # "short" = a short number (e.g. 100123) is printed as the barcode, "sku" = the SKU itself.
        # Tiny tags (12 x 18 mm) cannot hold a long SKU barcode - see docs/barcode-printing.md
        "barcode_mode": "short",
        "short_barcode_digits": 6,
        "barcode_module_mm": 0,            # width of the thinnest bar in mm; 0 = stretch to fit the tag (set from the Printer Test page)
        "label_size_id": "12x18",
        "label_sizes": DEFAULT_LABEL_SIZES,
    },
    "billing": {
        "invoice_prefix": "INV",
        "starting_invoice_number": 1,
        "payment_methods": ["Cash", "UPI", "Card", "Bank Transfer", "Other"],
        "default_payment_method": "Cash",
        "invoice_footer": "Thank you for shopping with us.",
        "tax_enabled": False,
        "tax_label": "GST",
        "tax_rate": 0,
        "tax_mode": "exclusive",          # exclusive = added on top, inclusive = already inside the price
        "staff_can_discount": True,
        "staff_max_discount_percent": 10,
        "staff_max_discount_amount": None,
    },
    "expenses": {
        "default_payment_method": "Cash",
    },
    "printer": {
        "name": "Udyama POS",
        "model": "UDY 420B",
        "connection": "USB",
        "label_size_id": "12x18",
        "copies": 1,
        "rotate": False,                   # print the tag sideways (if the driver feeds it the other way round)
    },
    "demo_data_loaded": False,
}


def default_settings() -> dict:
    return copy.deepcopy(DEFAULT_SETTINGS)


def merge_settings(stored: dict) -> dict:
    """Stored settings on top of defaults (so new options appear automatically)."""
    out = default_settings()
    for section, value in (stored or {}).items():
        if isinstance(value, dict) and isinstance(out.get(section), dict):
            out[section].update(value)
        else:
            out[section] = value
    return out
