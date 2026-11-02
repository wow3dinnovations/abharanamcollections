from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import current_user, get_ctx, read_upload, require
from app.core.context import AppContext
from app.schemas.common import paginate
from app.schemas.inventory import ProductIn, ProductUpdateIn
from app.services import product_service

router = APIRouter(prefix="/api/products", tags=["products"])

VIEW = ("inventory.view", "sales.create", "barcode.print", "barcode.reprint", "purchases.add", "purchases.view",
        "purchases.edit", "inventory.transfer_stock", "inventory.adjust_stock")


@router.get("")
def list_products(q: str = "", category_id: str = "", subcategory_id: str = "", vendor_id: str = "",
                  location_id: str = "", stock_status: str = "", added_from: str = "", added_to: str = "",
                  status: str = "", sort: str = "newest", sellable_only: bool = False, page: int = 1,
                  page_size: int = 25, user: dict = Depends(require(*VIEW)), ctx: AppContext = Depends(get_ctx)):
    rows = product_service.search(ctx, q=q, category_id=category_id, subcategory_id=subcategory_id, vendor_id=vendor_id,
                                  location_id=location_id, stock_status=stock_status, added_from=added_from,
                                  added_to=added_to, status=status, sort=sort, sellable_only=sellable_only)
    result = paginate(rows, page, page_size)
    maps = product_service._maps(ctx)
    result["items"] = [product_service.present(ctx, p, user, maps) for p in result["items"]]
    return result


@router.get("/lookup")
def lookup(code: str, user: dict = Depends(require(*VIEW)), ctx: AppContext = Depends(get_ctx)):
    p = product_service.lookup_code(ctx, code)
    return product_service.present(ctx, p, user)


@router.post("")
def create(body: ProductIn, user: dict = Depends(require("inventory.add_product")), ctx: AppContext = Depends(get_ctx)):
    return product_service.create_product(ctx, user, body.model_dump())


@router.get("/{product_id}")
def get_detail(product_id: str, user: dict = Depends(require(*VIEW)), ctx: AppContext = Depends(get_ctx)):
    return product_service.detail(ctx, user, product_id)


@router.put("/{product_id}")
def update(product_id: str, body: ProductUpdateIn, user: dict = Depends(require("inventory.edit_product")),
           ctx: AppContext = Depends(get_ctx)):
    return product_service.update_product(ctx, user, product_id, body.model_dump(exclude_unset=True))


@router.delete("/{product_id}")
def delete(product_id: str, user: dict = Depends(require("inventory.delete_product")), ctx: AppContext = Depends(get_ctx)):
    product_service.delete_product(ctx, user, product_id)
    return {"ok": True}


@router.post("/{product_id}/image")
def upload_image(product_id: str, file: UploadFile = File(...),
                 user: dict = Depends(require("inventory.edit_product", "inventory.add_product")),
                 ctx: AppContext = Depends(get_ctx)):
    return product_service.save_image(ctx, user, product_id, file.filename or "", read_upload(file, 6, "picture"))


@router.delete("/{product_id}/image")
def delete_image(product_id: str, user: dict = Depends(require("inventory.edit_product")),
                 ctx: AppContext = Depends(get_ctx)):
    return product_service.remove_image(ctx, user, product_id)
