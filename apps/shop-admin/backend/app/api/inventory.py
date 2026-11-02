from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_ctx, require
from app.core.context import AppContext
from app.core.errors import Forbidden, NotFound
from app.schemas.common import paginate
from app.schemas.inventory import AddStockIn, AdjustIn, PurchaseIn, PurchaseUpdateIn, SetQuantityIn, TransferIn
from app.services import inventory_service, product_service, purchase_service

router = APIRouter(prefix="/api", tags=["inventory & purchases"])


# ------------------------------------------------------------- stock by location
@router.get("/inventory/stock")
def stock(q: str = "", category_id: str = "", location_id: str = "", stock_status: str = "", page: int = 1,
          page_size: int = 25, user: dict = Depends(require("inventory.view")), ctx: AppContext = Depends(get_ctx)):
    """One row per product per location, so multi-location stock is easy to read."""
    rows = product_service.search(ctx, q=q, category_id=category_id, location_id=location_id,
                                  stock_status=stock_status, sort="name")
    maps = product_service._maps(ctx)
    flat = []
    for p in rows:
        pres = None
        entries = [(lid, qty) for lid, qty in p["stock"].items() if qty > 0 and (not location_id or lid == location_id)]
        if not entries:
            entries = [("", 0)]
        for lid, qty in entries:
            if pres is None:
                pres = product_service.present(ctx, p, user, maps)
            flat.append({
                "product_id": p["id"], "sku": p["sku"], "name": p["name"], "category_name": pres["category_name"],
                "location_id": lid, "location_name": maps["locations"].get(lid, "—"), "quantity": qty,
                "total_quantity": pres["current_quantity"], "selling_price": p["selling_price"],
                "purchase_rate": pres.get("purchase_rate"), "stock_value": (pres.get("purchase_rate", 0) or 0) * qty
                if "purchase_rate" in pres else None,
                "age_days": pres["age_days"], "is_low_stock": pres["is_low_stock"], "is_out_of_stock": pres["is_out_of_stock"],
                "image_url": pres["image_url"],
            })
    return paginate(flat, page, page_size)


@router.post("/inventory/adjust")
def adjust(body: AdjustIn, user: dict = Depends(require("inventory.adjust_stock")), ctx: AppContext = Depends(get_ctx)):
    return inventory_service.adjust(ctx, user, body.product_id, body.location_id, body.quantity_change,
                                    body.reason_type, body.remarks)


@router.post("/inventory/add-stock")
def add_stock(body: AddStockIn, user: dict = Depends(require("inventory.adjust_stock")), ctx: AppContext = Depends(get_ctx)):
    """Add Stock: needs the 'Adjust Stock' permission.  Rates and vendors are cost information - only for people who may see cost."""
    if (body.purchase_rate is not None or body.vendor_id) and not product_service.can_see_cost(user):
        raise Forbidden("You do not have permission to enter purchase rates or vendors.")
    return inventory_service.add_stock(ctx, user, body.product_id, body.location_id, body.quantity, body.kind,
                                       body.purchase_rate, body.vendor_id, body.remarks)


@router.post("/inventory/set-quantity")
def set_quantity(body: SetQuantityIn, user: dict = Depends(require("inventory.adjust_stock")), ctx: AppContext = Depends(get_ctx)):
    """Adjust Stock: set the correct (counted) quantity for one location."""
    return inventory_service.set_quantity(ctx, user, body.product_id, body.location_id, body.new_quantity, body.reason, body.remarks)


@router.post("/inventory/transfers")
def make_transfer(body: TransferIn, user: dict = Depends(require("inventory.transfer_stock")),
                  ctx: AppContext = Depends(get_ctx)):
    return inventory_service.transfer(ctx, user, body.from_location_id, body.to_location_id,
                                      [i.model_dump() for i in body.items], body.remarks)


@router.get("/inventory/transfers")
def transfers(start: str = "", end: str = "", page: int = 1, page_size: int = 25,
              user: dict = Depends(require("inventory.view", "inventory.transfer_stock")), ctx: AppContext = Depends(get_ctx)):
    return paginate(inventory_service.list_transfers(ctx, start or None, end or None), page, page_size)


@router.get("/inventory/transactions")
def transactions(product_id: str = "", location_id: str = "", type: str = "", start: str = "", end: str = "",
                 q: str = "", page: int = 1, page_size: int = 25,
                 user: dict = Depends(require("inventory.view")), ctx: AppContext = Depends(get_ctx)):
    rows = inventory_service.list_transactions(ctx, product_id=product_id or None, location_id=location_id or None,
                                               tx_type=type or None, start=start or None, end=end or None, q=q)
    return paginate(rows, page, page_size)


# ------------------------------------------------------------- purchases
@router.get("/purchases")
def purchases(q: str = "", vendor_id: str = "", location_id: str = "", start: str = "", end: str = "",
              page: int = 1, page_size: int = 25, user: dict = Depends(require("purchases.view")),
              ctx: AppContext = Depends(get_ctx)):
    rows = purchase_service.list_purchases(ctx, q=q, vendor_id=vendor_id, location_id=location_id, start=start, end=end)
    result = paginate(rows, page, page_size)
    result["items"] = [purchase_service.present(ctx, p) for p in result["items"]]
    return result


@router.post("/purchases")
def add_purchase(body: PurchaseIn, user: dict = Depends(require("purchases.add")), ctx: AppContext = Depends(get_ctx)):
    data = body.model_dump()
    return purchase_service.present(ctx, purchase_service.create(ctx, user, data))


@router.get("/purchases/{purchase_id}")
def get_purchase(purchase_id: str, user: dict = Depends(require("purchases.view")), ctx: AppContext = Depends(get_ctx)):
    p = ctx.store.get("purchases", purchase_id)
    if p is None:
        raise NotFound("Purchase not found.")
    return purchase_service.present(ctx, p)


@router.put("/purchases/{purchase_id}")
def edit_purchase(purchase_id: str, body: PurchaseUpdateIn, user: dict = Depends(require("purchases.edit")),
                  ctx: AppContext = Depends(get_ctx)):
    data = body.model_dump(exclude_unset=True)
    return purchase_service.present(ctx, purchase_service.update(ctx, user, purchase_id, data))
