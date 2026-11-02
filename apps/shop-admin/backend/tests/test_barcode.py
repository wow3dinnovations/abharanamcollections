"""Barcode generation, label data and print history (Phase 4)."""
from __future__ import annotations

from app.services import barcode_service
from tests.helpers import basic_setup, make_product, ok


def test_code128_pattern_is_valid():
    bits = barcode_service.bar_pattern("ABH-JHM-000123")
    assert set(bits) <= {"0", "1"}
    assert bits.startswith("11010010000") or bits.startswith("11010000100")   # Start B / Start A
    assert bits.endswith("1100011101011")                                     # Code 128 stop pattern
    svg = barcode_service.svg("ABH-JHM-000123")
    assert svg.startswith("<svg") and "viewBox" in svg and "<path" in svg and "<script" not in svg


def test_invalid_barcode_text_rejected():
    import pytest
    from app.core.errors import ValidationFailed
    for bad in ("", "has space", "a<b>", "x" * 60):
        with pytest.raises(ValidationFailed):
            barcode_service.bar_pattern(bad)


def test_labels_contain_required_content(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, name="Gold Finish Jhumka", sku="ABH-JHM-000123", selling_price=799)
    r = ok(admin.post("/api/barcode/labels", json={"items": [{"product_id": p["id"], "copies": 3}]}))
    label = r["labels"][0]
    assert label["name"] == "Gold Finish Jhumka" and label["price"] == 799 and label["sku"] == "ABH-JHM-000123"
    assert label["copies"] == 3 and label["svg"].startswith("<svg")
    assert r["business_name"] == "ABHARANAM COLLECTIONS" and r["total_labels"] == 3
    sizes = {s["name"] for s in r["label_sizes"]}
    assert {"25mm x 50mm", "30mm x 50mm", "40mm x 60mm"} <= sizes
    assert admin.post("/api/barcode/labels", json={"items": [{"product_id": p["id"], "copies": 0}]}).status_code == 422
    assert admin.post("/api/barcode/labels", json={"items": []}).status_code == 422
    assert admin.post("/api/barcode/labels", json={"items": [{"product_id": "PRD-9", "copies": 1}]}).status_code == 422


def test_print_job_history_and_reprint_permission(admin, make_staff, ctx):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc)
    job = ok(admin.post("/api/barcode/print-jobs", json={"items": [{"product_id": p["id"], "copies": 4}], "label_size_id": "30x50"}))
    assert job["total_labels"] == 4 and job["label_size"] == "30mm x 50mm"
    assert admin.post("/api/barcode/print-jobs", json={"items": [{"product_id": p["id"], "copies": 1}], "label_size_id": "nope"}).status_code == 422
    assert ok(admin.get("/api/barcode/print-jobs"))["total"] == 1
    assert any(a["action"] == "BARCODE_PRINTED" for a in ctx.store.all("audit_logs"))
    printer = make_staff(["barcode.print"])
    assert printer.post("/api/barcode/labels", json={"items": [{"product_id": p["id"], "copies": 1}]}).status_code == 200
    assert printer.post("/api/barcode/print-jobs", json={"items": [{"product_id": p["id"], "copies": 1}], "label_size_id": "30x50",
                                                         "reprint_of": job["id"]}).status_code == 403
    nobody = make_staff([])
    assert nobody.post("/api/barcode/labels", json={"items": [{"product_id": p["id"], "copies": 1}]}).status_code == 403


def test_scanner_workflow_lookup_accepts_scanner_style_input(admin):
    """A scanner types the code then presses Enter; the POS sends it to /lookup (trimmed)."""
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, sku="ABH-JHM-000123")
    r = ok(admin.get("/api/products/lookup", params={"code": "  ABH-JHM-000123\r\n"}))
    assert r["id"] == p["id"] and r["current_quantity"] == 10
    assert admin.get("/api/products/lookup", params={"code": "ABH-UNKNOWN-1"}).status_code == 404
