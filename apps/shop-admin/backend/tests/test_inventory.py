"""Masters, products, SKU/barcode rules, images, stock, transfers, purchases (Phases 2-3)."""
from __future__ import annotations

import io

from PIL import Image

from tests.helpers import basic_setup, make_category, make_location, make_product, make_vendor, ok


def stock_of(c, pid):
    return {r["location_id"]: r["quantity"] for r in ok(c.get(f"/api/products/{pid}"))["stock_by_location"]}


# ------------------------------------------------------------------ masters
def test_category_vendor_location_crud_and_rules(admin):
    cat = make_category(admin)
    assert cat["code"] == "EAR"
    assert admin.post("/api/categories", json={"name": "earrings", "code": "XXX"}).status_code == 409   # same name
    assert admin.post("/api/categories", json={"name": "Other", "code": "ear"}).status_code == 409      # same code
    assert admin.post("/api/categories", json={"name": "Bad", "code": "a b"}).status_code == 422
    assert admin.post("/api/categories", json={"name": "", "code": "AAA"}).status_code == 422
    sub = ok(admin.post("/api/subcategories", json={"name": "Studs", "category_id": cat["id"]}))
    assert admin.post("/api/subcategories", json={"name": "Studs", "category_id": "CAT-9999"}).status_code == 422
    assert ok(admin.put(f"/api/categories/{cat['id']}", json={"name": "Ear Rings"}))["name"] == "Ear Rings"
    assert ok(admin.put(f"/api/categories/{cat['id']}", json={"active": False}))["active"] is False
    assert len(ok(admin.get("/api/categories?active_only=true"))["items"]) == 0
    assert len(ok(admin.get("/api/categories"))["items"]) == 1
    v = make_vendor(admin)
    assert ok(admin.get("/api/vendors"))["items"][0]["id"] == v["id"]
    assert sub["id"].startswith("SUB-")


def test_default_expense_categories_seeded(admin):
    names = [c["name"] for c in ok(admin.get("/api/expense-categories"))["items"]]
    assert "Shop Rent" in names and "Packaging" in names and len(names) == 21


def test_staff_needs_permission_to_manage_masters(admin, make_staff):
    staff = make_staff(["inventory.view"])
    assert staff.get("/api/categories").status_code == 200          # dropdowns work for everyone
    assert staff.post("/api/categories", json={"name": "X", "code": "XX"}).status_code == 403
    assert staff.post("/api/vendors", json={"name": "V"}).status_code == 403
    assert staff.post("/api/locations", json={"name": "L"}).status_code == 403


# ------------------------------------------------------------------ products
def test_create_product_sets_stock_purchase_and_ledger(admin, ctx):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, sku="abh-jhm-test001")
    assert p["sku"] == "ABH-JHM-TEST001" and p["barcode"] == "100000"          # short numeric barcode (fits a 12 x 18 mm tag)
    assert ok(admin.get("/api/products/lookup?code=100000"))["id"] == p["id"]  # the POS finds it by barcode ...
    assert ok(admin.get("/api/products/lookup?code=abh-jhm-test001"))["id"] == p["id"]   # ... and by SKU
    assert p["current_quantity"] == 10 and p["initial_quantity"] == 10 and p["sold_quantity"] == 0
    assert p["stock_by_location"][0]["quantity"] == 10
    assert p["age_days"] == 0 and p["age_bucket"] == "0-30 Days"
    assert p["stock_value"] == 3000
    purchases = ok(admin.get("/api/purchases"))["items"]
    assert len(purchases) == 1 and purchases[0]["total"] == 3000 and purchases[0]["source"] == "product_entry"
    txns = ok(admin.get("/api/inventory/transactions"))["items"]
    assert txns[0]["type"] == "PURCHASE" and txns[0]["quantity"] == 10 and txns[0]["previous_stock"] == 0 and txns[0]["new_stock"] == 10
    assert any(a["action"] == "PRODUCT_ADDED" for a in ctx.store.all("audit_logs"))


def test_auto_generated_sku_and_barcode_follow_category(admin):
    cat, ven, loc = basic_setup(admin)
    a = make_product(admin, cat, ven, loc, initial_quantity=0)
    b = make_product(admin, cat, ven, loc, initial_quantity=0)
    assert a["sku"] == "ABH-EAR-000001" and b["sku"] == "ABH-EAR-000002"
    assert (a["barcode"], b["barcode"]) == ("100000", "100001")           # short numeric barcodes, never repeated
    rings = make_category(admin, "Rings", "RIN")
    c = make_product(admin, rings, ven, loc, initial_quantity=0)
    assert c["sku"] == "ABH-RIN-000001" and c["barcode"] == "100002"


def test_barcode_can_be_the_sku_instead(admin):
    ok(admin.put("/api/settings", json={"inventory": {"barcode_mode": "sku"}}))
    cat, ven, loc = basic_setup(admin)
    a = make_product(admin, cat, ven, loc, initial_quantity=0)
    assert a["barcode"] == a["sku"] == "ABH-EAR-000001"
    ok(admin.put("/api/settings", json={"inventory": {"barcode_mode": "short", "short_barcode_digits": 8}}))
    b = make_product(admin, cat, ven, loc, initial_quantity=0)
    assert b["barcode"] == "10000000" and len(b["barcode"]) == 8
    assert admin.put("/api/settings", json={"inventory": {"barcode_mode": "weird"}}).status_code == 422
    assert admin.put("/api/settings", json={"inventory": {"short_barcode_digits": 3}}).status_code == 422
    assert admin.put("/api/settings", json={"inventory": {"barcode_module_mm": 0.02}}).status_code == 422
    assert ok(admin.put("/api/settings", json={"inventory": {"barcode_module_mm": 0.169}}))["inventory"]["barcode_module_mm"] == 0.169


def test_short_barcode_never_collides_with_a_typed_one(admin):
    cat, ven, loc = basic_setup(admin)
    ok(admin.post("/api/products", json={"name": "Manual", "category_id": cat["id"], "selling_price": 10, "barcode": "100000"}))
    nxt = make_product(admin, cat, ven, loc, initial_quantity=0)
    assert nxt["barcode"] == "100001"                                      # skipped the one already taken


def test_default_label_size_and_printer_are_set_for_this_shop(admin):
    st = ok(admin.get("/api/settings"))
    sizes = {s["id"]: s for s in st["inventory"]["label_sizes"]}
    assert sizes["12x18"]["width_mm"] == 18 and sizes["12x18"]["height_mm"] == 12
    assert st["inventory"]["label_size_id"] == "12x18" and st["printer"]["model"] == "UDY 420B" and st["printer"]["connection"] == "USB"
    assert st["billing"]["tax_enabled"] is False                            # no GST unless the owner switches it on


def test_duplicate_sku_and_barcode_rejected(admin):
    cat, ven, loc = basic_setup(admin)
    make_product(admin, cat, ven, loc, sku="ABH-EAR-DUP1")
    r = admin.post("/api/products", json={"name": "X", "category_id": cat["id"], "selling_price": 10, "sku": "abh-ear-dup1"})
    assert r.status_code == 409
    r = admin.post("/api/products", json={"name": "X", "category_id": cat["id"], "selling_price": 10, "sku": "NEW-1", "barcode": "ABH-EAR-DUP1"})
    assert r.status_code == 409          # barcode may not equal another product's SKU either
    assert admin.post("/api/products", json={"name": "X", "category_id": cat["id"], "selling_price": 10, "sku": "has space"}).status_code == 422


def test_invalid_numbers_rejected(admin, ctx):
    cat, ven, loc = basic_setup(admin)
    base = {"name": "X", "category_id": cat["id"], "selling_price": 100, "purchase_location_id": loc["id"]}
    for bad in ({"selling_price": -5}, {"purchase_rate": -1}, {"initial_quantity": -3}, {"selling_price": 100, "min_selling_price": 500},
                {"discount_allowed_percent": 150}, {"initial_quantity": 2, "purchase_location_id": ""}, {"category_id": "CAT-404"}):
        r = admin.post("/api/products", json={**base, **bad})
        assert r.status_code in (422, 400), (bad, r.text)
    assert ctx.store.all("products") == []           # nothing partially saved


def test_update_product_and_price_change_audited(admin, ctx):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc)
    r = ok(admin.put(f"/api/products/{p['id']}", json={"selling_price": 799, "name": "Gold Finish Jhumka", "colour": "Gold"}))
    assert r["selling_price"] == 799 and r["name"] == "Gold Finish Jhumka"
    assert r["current_quantity"] == 10                     # stock cannot be changed by editing
    assert admin.put(f"/api/products/{p['id']}", json={"selling_price": -1}).status_code == 422
    log = [a for a in ctx.store.all("audit_logs") if a["action"] == "PRODUCT_EDITED"][-1]
    assert "699" in log["details"] and "799" in log["details"]


def test_search_filters_and_pagination(admin):
    cat, ven, loc = basic_setup(admin)
    other = make_location(admin, "Hyderabad")
    for i in range(7):
        make_product(admin, cat, ven, loc, name=f"Jhumka {i}", design_number=f"D{i}", initial_quantity=i)
    make_product(admin, cat, ven, other, name="Chain Long", initial_quantity=5)
    r = ok(admin.get("/api/products?page_size=5"))
    assert r["total"] == 8 and len(r["items"]) == 5 and r["pages"] == 2
    assert ok(admin.get("/api/products?q=chain"))["total"] == 1
    assert ok(admin.get("/api/products?q=D3"))["total"] == 1                    # design number
    assert ok(admin.get("/api/products?stock_status=out_of_stock"))["total"] == 1
    assert ok(admin.get("/api/products?stock_status=low_stock"))["total"] == 3   # qty 1,2,3 (threshold 3)
    assert ok(admin.get(f"/api/products?location_id={other['id']}"))["total"] == 1
    assert ok(admin.get("/api/products?sort=name&page_size=1"))["items"][0]["name"] == "Chain Long"


def test_barcode_lookup_by_sku_and_barcode(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, sku="ABH-JHM-000123", barcode="8901234567890")
    assert ok(admin.get("/api/products/lookup?code=abh-jhm-000123"))["id"] == p["id"]
    assert ok(admin.get("/api/products/lookup?code=8901234567890"))["id"] == p["id"]
    assert admin.get("/api/products/lookup?code=NOPE-999").status_code == 404
    assert admin.get("/api/products/lookup?code=bad%20code").status_code == 422
    assert admin.get("/api/products/lookup?code=").status_code == 422


def test_delete_product_only_when_no_stock(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc)
    assert admin.delete(f"/api/products/{p['id']}").status_code == 409
    ok(admin.post("/api/inventory/adjust", json={"product_id": p["id"], "location_id": loc["id"], "quantity_change": -10,
                                                 "reason_type": "DAMAGE", "remarks": "test"}))
    ok(admin.delete(f"/api/products/{p['id']}"))
    assert ok(admin.get("/api/products"))["total"] == 0
    assert admin.get(f"/api/products/{p['id']}").status_code == 404


def test_product_image_upload_validation_and_serving(admin, settings):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, sku="ABH-EAR-IMG1")
    buf = io.BytesIO()
    Image.new("RGB", (300, 200), (200, 30, 60)).save(buf, "PNG")
    r = admin.post(f"/api/products/{p['id']}/image", files={"file": ("pic.png", buf.getvalue(), "image/png")})
    body = ok(r)
    assert body["image"] == "uploads/products/ABH-EAR-IMG1.jpg"
    assert (settings.uploads_dir / "products" / "ABH-EAR-IMG1.jpg").exists()
    img = admin.get(body["image_url"])
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    bad = admin.post(f"/api/products/{p['id']}/image", files={"file": ("x.exe", b"MZ....", "application/octet-stream")})
    assert bad.status_code == 422
    fake = admin.post(f"/api/products/{p['id']}/image", files={"file": ("x.png", b"not really an image", "image/png")})
    assert fake.status_code == 422
    assert admin.get("/api/files/products/..%2F..%2Fdata%2Fusers.json").status_code == 404
    assert admin.get("/api/files/products/..%5Cusers.json").status_code == 404


def test_files_require_login(admin, client):
    assert client.get("/api/files/products/whatever.jpg").status_code == 401


# ------------------------------------------------------------------ stock movements
def test_adjust_stock_rules_and_ledger(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc)
    body = {"product_id": p["id"], "location_id": loc["id"], "reason_type": "STOCK_ADJUSTMENT", "remarks": "recount"}
    ok(admin.post("/api/inventory/adjust", json={**body, "quantity_change": 2}))
    assert stock_of(admin, p["id"]) == {loc["id"]: 12}
    assert admin.post("/api/inventory/adjust", json={**body, "quantity_change": -50}).status_code == 409     # not enough stock
    assert admin.post("/api/inventory/adjust", json={**body, "quantity_change": 0}).status_code == 422
    assert admin.post("/api/inventory/adjust", json={**body, "quantity_change": -1, "remarks": ""}).status_code == 422
    assert admin.post("/api/inventory/adjust", json={**body, "quantity_change": 3, "reason_type": "DAMAGE"}).status_code == 422
    ok(admin.post("/api/inventory/adjust", json={**body, "quantity_change": -2, "reason_type": "LOST", "remarks": "missing"}))
    assert stock_of(admin, p["id"]) == {loc["id"]: 10}
    types = [t["type"] for t in ok(admin.get(f"/api/inventory/transactions?product_id={p['id']}"))["items"]]
    assert types == ["LOST", "STOCK_ADJUSTMENT", "PURCHASE"]


def test_stock_transfer_between_locations(admin):
    cat, ven, loc = basic_setup(admin)
    other = make_location(admin, "Warehouse")
    p = make_product(admin, cat, ven, loc, initial_quantity=5)
    t = ok(admin.post("/api/inventory/transfers", json={"from_location_id": loc["id"], "to_location_id": other["id"],
                                                        "items": [{"product_id": p["id"], "quantity": 2}]}))
    assert t["items"][0]["quantity"] == 2
    assert stock_of(admin, p["id"]) == {loc["id"]: 3, other["id"]: 2}
    assert ok(admin.get(f"/api/products/{p['id']}"))["current_quantity"] == 5
    assert admin.post("/api/inventory/transfers", json={"from_location_id": loc["id"], "to_location_id": other["id"],
                                                        "items": [{"product_id": p["id"], "quantity": 4}]}).status_code == 409
    assert admin.post("/api/inventory/transfers", json={"from_location_id": loc["id"], "to_location_id": loc["id"],
                                                        "items": [{"product_id": p["id"], "quantity": 1}]}).status_code == 422
    assert stock_of(admin, p["id"]) == {loc["id"]: 3, other["id"]: 2}           # failed transfers changed nothing
    assert ok(admin.get("/api/inventory/transfers"))["total"] == 1
    assert ok(admin.get("/api/inventory/stock"))["total"] == 2                   # one row per location


def test_cannot_deactivate_location_with_stock(admin):
    cat, ven, loc = basic_setup(admin)
    make_product(admin, cat, ven, loc, initial_quantity=3)
    assert admin.put(f"/api/locations/{loc['id']}", json={"active": False}).status_code == 409


# ------------------------------------------------------------------ purchases
def test_purchase_increases_stock_and_averages_cost(admin, ctx):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, initial_quantity=5, purchase_rate=300)
    pur = ok(admin.post("/api/purchases", json={"vendor_id": ven["id"], "location_id": loc["id"], "invoice_number": "INV-77",
                                                "purchase_date": "2026-09-19", "items": [{"product_id": p["id"], "quantity": 10, "rate": 330}]}))
    assert pur["total"] == 3300 and pur["id"].startswith("PUR-")
    prod = ok(admin.get(f"/api/products/{p['id']}"))
    assert prod["current_quantity"] == 15                      # 5 + 10
    assert prod["purchase_rate"] == 320                        # (5*300 + 10*330) / 15
    assert prod["last_purchase_rate"] == 330
    assert ok(admin.get("/api/purchases"))["total"] == 2
    assert any(a["action"] == "PURCHASE_ADDED" for a in ctx.store.all("audit_logs"))
    assert ctx.store.all("inventory_transactions")[-1]["type"] == "PURCHASE"


def test_purchase_validation(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, initial_quantity=1)
    base = {"vendor_id": ven["id"], "location_id": loc["id"]}
    assert admin.post("/api/purchases", json={**base, "items": []}).status_code == 422
    assert admin.post("/api/purchases", json={**base, "items": [{"product_id": p["id"], "quantity": 0, "rate": 5}]}).status_code == 422
    assert admin.post("/api/purchases", json={**base, "items": [{"product_id": p["id"], "quantity": 1, "rate": -5}]}).status_code == 422
    assert admin.post("/api/purchases", json={**base, "items": [{"product_id": "PRD-999999", "quantity": 1, "rate": 5}]}).status_code == 422
    assert admin.post("/api/purchases", json={"items": [{"product_id": p["id"], "quantity": 1, "rate": 5}]}).status_code == 422   # no location
    assert ok(admin.get(f"/api/products/{p['id']}"))["current_quantity"] == 1


def test_purchase_edit_adjusts_stock_safely(admin):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc, initial_quantity=0)
    pur = ok(admin.post("/api/purchases", json={"vendor_id": ven["id"], "location_id": loc["id"],
                                                "items": [{"product_id": p["id"], "quantity": 10, "rate": 100}]}))
    ok(admin.put(f"/api/purchases/{pur['id']}", json={"invoice_number": "X1", "items": [{"product_id": p["id"], "quantity": 8, "rate": 110}]}))
    prod = ok(admin.get(f"/api/products/{p['id']}"))
    assert prod["current_quantity"] == 8 and prod["purchase_rate"] == 110
    assert ok(admin.get(f"/api/purchases/{pur['id']}"))["total"] == 880
    # cannot reduce below what has already left the shelf
    ok(admin.post("/api/inventory/adjust", json={"product_id": p["id"], "location_id": loc["id"], "quantity_change": -6,
                                                 "reason_type": "OTHER", "remarks": "sold elsewhere"}))
    r = admin.put(f"/api/purchases/{pur['id']}", json={"items": [{"product_id": p["id"], "quantity": 1, "rate": 110}]})
    assert r.status_code == 409
    assert ok(admin.get(f"/api/products/{p['id']}"))["current_quantity"] == 2


def test_purchases_are_not_expenses(admin):
    cat, ven, loc = basic_setup(admin)
    make_product(admin, cat, ven, loc)
    # (expense module comes later - here we only confirm purchases have their own list)
    assert ok(admin.get("/api/purchases"))["total"] == 1


def test_cost_hidden_from_users_without_cost_permission(admin, make_staff):
    cat, ven, loc = basic_setup(admin)
    p = make_product(admin, cat, ven, loc)
    cashier = make_staff(["inventory.view"])
    view = ok(cashier.get(f"/api/products/{p['id']}"))
    assert "purchase_rate" not in view and "stock_value" not in view and "vendor_name" not in view
    assert view["selling_price"] == 699
    assert cashier.post("/api/inventory/adjust", json={"product_id": p["id"], "location_id": loc["id"], "quantity_change": 1,
                                                       "remarks": "x"}).status_code == 403
    assert cashier.post("/api/products", json={"name": "N", "category_id": cat["id"], "selling_price": 5}).status_code == 403
    assert cashier.get("/api/purchases").status_code == 403
