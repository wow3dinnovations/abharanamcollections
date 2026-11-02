from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.api.deps import current_user, get_ctx, require
from app.core.context import AppContext
from app.core.errors import Forbidden, NotFound
from app.schemas.common import paginate
from app.schemas.sales import CancelIn, CustomerIn, CustomerUpdateIn, SaleIn
from app.services import audit_service, customer_service, invoice_service, sale_service

router = APIRouter(prefix="/api", tags=["sales & customers"])


def _present_sale(sale: dict, user: dict) -> dict:
    out = dict(sale)
    if user["role"] != "admin" and not any(p in user.get("permissions", []) for p in
                                           ("reports.profitability", "reports.sales_detail", "reports.inventory")):
        out["items"] = [{k: v for k, v in it.items() if k != "unit_cost"} for it in sale["items"]]
    return out


@router.post("/sales")
def create_sale(body: SaleIn, user: dict = Depends(require("sales.create")), ctx: AppContext = Depends(get_ctx)):
    sale = sale_service.create_sale(ctx, user, body.model_dump())
    try:
        if sale_service.can_view_invoice(user, sale):
            invoice_service.build_pdf(ctx, sale)
    except Exception:           # the sale is already saved - a PDF problem must never undo it
        import logging
        logging.getLogger("abharanam").exception("invoice PDF failed for %s", sale["invoice_number"])
    return _present_sale(sale, user)


@router.get("/sales")
def list_sales(start: str = "", end: str = "", cashier_id: str = "", payment_method: str = "", customer: str = "",
               invoice: str = "", status: str = "", page: int = 1, page_size: int = 20,
               user: dict = Depends(require("sales.view")), ctx: AppContext = Depends(get_ctx)):
    rows = sale_service.search(ctx, start=start, end=end, cashier_id=cashier_id, payment_method=payment_method,
                               customer=customer, invoice=invoice, status=status)
    result = paginate(rows, page, page_size)
    result["items"] = [{k: v for k, v in s.items() if k != "items"} | {"lines": len(s["items"])} for s in result["items"]]
    return result


@router.get("/sales/cashiers")
def cashiers(user: dict = Depends(require("sales.view")), ctx: AppContext = Depends(get_ctx)):
    seen: dict[str, str] = {}
    for s in ctx.store.all("sales"):
        seen[s["cashier_id"]] = s.get("cashier_name", "")
    return {"items": [{"id": k, "name": v} for k, v in sorted(seen.items(), key=lambda kv: kv[1])]}


@router.get("/sales/{sale_id}")
def get_sale(sale_id: str, user: dict = Depends(require("sales.view", "billing.generate", "billing.reprint")),
             ctx: AppContext = Depends(get_ctx)):
    return _present_sale(sale_service.get(ctx, sale_id), user)


@router.post("/sales/{sale_id}/cancel")
def cancel(sale_id: str, body: CancelIn, user: dict = Depends(require("sales.cancel")), ctx: AppContext = Depends(get_ctx)):
    sale = sale_service.cancel_sale(ctx, user, sale_id, body.reason)
    invoice_service.invoice_path(ctx, sale).unlink(missing_ok=True)          # regenerated with a CANCELLED mark
    return _present_sale(sale, user)


@router.get("/sales/{sale_id}/invoice.pdf")
def invoice_pdf(sale_id: str, user: dict = Depends(require("billing.generate", "billing.reprint")),
                ctx: AppContext = Depends(get_ctx)):
    sale = sale_service.get(ctx, sale_id)
    if not sale_service.can_view_invoice(user, sale):
        raise Forbidden("You can only print today's bills. Ask the administrator to reprint older bills.")
    path = invoice_service.invoice_path(ctx, sale)
    if not path.exists():
        invoice_service.build_pdf(ctx, sale)
    return FileResponse(path, media_type="application/pdf", headers={
        "Content-Disposition": f'inline; filename="{sale["invoice_number"]}.pdf"', "Cache-Control": "no-store"})


@router.post("/sales/{sale_id}/reprint")
def log_reprint(sale_id: str, user: dict = Depends(require("billing.reprint", "billing.generate")),
                ctx: AppContext = Depends(get_ctx)):
    sale = sale_service.get(ctx, sale_id)
    if not sale_service.can_view_invoice(user, sale):
        raise Forbidden("You can only print today's bills. Ask the administrator to reprint older bills.")
    audit_service.log_now(ctx, user, "BILL_REPRINTED", "sale", sale_id, f"Printed / reprinted {sale['invoice_number']}")
    return {"ok": True}


# ------------------------------------------------------------- customers
@router.get("/customers")
def customers(q: str = "", active_only: bool = False, page: int = 1, page_size: int = 25,
              user: dict = Depends(require("customers.view", "customers.manage", "sales.create")),
              ctx: AppContext = Depends(get_ctx)):
    rows = customer_service.search(ctx, q, active_only)
    result = paginate(rows, page, page_size)
    result["items"] = customer_service.with_stats(ctx, result["items"])
    return result


@router.post("/customers")
def add_customer(body: CustomerIn, user: dict = Depends(require("customers.manage", "sales.create")),
                 ctx: AppContext = Depends(get_ctx)):
    return customer_service.create(ctx, user, body.model_dump())


@router.put("/customers/{cid}")
def edit_customer(cid: str, body: CustomerUpdateIn, user: dict = Depends(require("customers.manage")),
                  ctx: AppContext = Depends(get_ctx)):
    return customer_service.update(ctx, user, cid, body.model_dump(exclude_unset=True))


@router.get("/customers/{cid}")
def customer_detail(cid: str, user: dict = Depends(require("customers.view", "customers.manage")),
                    ctx: AppContext = Depends(get_ctx)):
    c = ctx.store.get("customers", cid)
    if c is None:
        raise NotFound("Customer not found.")
    sales = [{k: v for k, v in s.items() if k != "items"} for s in sale_service.search(ctx) if s.get("customer_id") == cid]
    return {**customer_service.with_stats(ctx, [c])[0], "sales": sales}
