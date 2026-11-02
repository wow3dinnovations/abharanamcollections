"""Expenses, reports, exports and the dashboard."""
from __future__ import annotations

import re
from datetime import datetime

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import Response

from app.api.deps import current_user, get_ctx, read_upload, require
from app.core.context import AppContext
from app.core.errors import Forbidden, NotFound, ValidationFailed
from app.schemas.common import Body, paginate
from app.services import audit_service, dashboard_service, expense_service, export_service, report_service
from app.services.report_service import REPORTS
from typing import Optional

router = APIRouter(prefix="/api", tags=["expenses, reports & dashboard"])
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class ExpenseIn(Body):
    expense_date: str = ""
    category_id: str = ""
    description: str = ""
    amount: float = 0
    payee: str = ""
    payment_method: str = ""
    reference_no: str = ""
    notes: str = ""


class ExpenseUpdateIn(Body):
    expense_date: Optional[str] = None
    category_id: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    payee: Optional[str] = None
    payment_method: Optional[str] = None
    reference_no: Optional[str] = None
    notes: Optional[str] = None


class CancelIn(Body):
    reason: str = ""


# ------------------------------------------------------------- expenses
@router.get("/expenses")
def list_expenses(start: str = "", end: str = "", category_id: str = "", payment_method: str = "", payee: str = "",
                  q: str = "", status: str = "", page: int = 1, page_size: int = 25,
                  user: dict = Depends(require("expenses.view")), ctx: AppContext = Depends(get_ctx)):
    rows = expense_service.search(ctx, start=start, end=end, category_id=category_id, payment_method=payment_method,
                                  payee=payee, q=q, status=status)
    result = paginate(rows, page, page_size)
    result["total_amount"] = float(sum(e["amount"] for e in rows if e["status"] == "active"))
    result["items"] = [expense_service.present(e) for e in result["items"]]
    return result


@router.post("/expenses")
def add_expense(body: ExpenseIn, user: dict = Depends(require("expenses.add")), ctx: AppContext = Depends(get_ctx)):
    return expense_service.present(expense_service.create(ctx, user, body.model_dump()))


@router.get("/expenses/{eid}")
def get_expense(eid: str, user: dict = Depends(require("expenses.view")), ctx: AppContext = Depends(get_ctx)):
    e = ctx.store.get("expenses", eid)
    if e is None:
        raise NotFound("Expense not found.")
    return expense_service.present(e)


@router.put("/expenses/{eid}")
def edit_expense(eid: str, body: ExpenseUpdateIn, user: dict = Depends(require("expenses.edit")), ctx: AppContext = Depends(get_ctx)):
    return expense_service.present(expense_service.update(ctx, user, eid, body.model_dump(exclude_unset=True)))


@router.post("/expenses/{eid}/cancel")
def cancel_expense(eid: str, body: CancelIn, user: dict = Depends(require("expenses.cancel")), ctx: AppContext = Depends(get_ctx)):
    return expense_service.present(expense_service.cancel(ctx, user, eid, body.reason))


@router.post("/expenses/{eid}/receipt")
def upload_receipt(eid: str, file: UploadFile = File(...), user: dict = Depends(require("expenses.add", "expenses.edit")),
                   ctx: AppContext = Depends(get_ctx)):
    return expense_service.present(expense_service.save_receipt(ctx, user, eid, file.filename or "", read_upload(file, 8, "receipt")))


# ------------------------------------------------------------- dashboard
@router.get("/dashboard")
def dashboard(user: dict = Depends(current_user), ctx: AppContext = Depends(get_ctx)):
    return dashboard_service.build(ctx, user)


# ------------------------------------------------------------- reports
def _params(request: Request) -> dict:
    return {k: v for k, v in request.query_params.items() if k not in ("format",)}


def _can_report(user: dict, key: str) -> None:
    spec = REPORTS.get(key)
    if spec is None:
        raise NotFound("Unknown report.")
    if user["role"] != "admin" and spec["perm"] not in user.get("permissions", []):
        raise Forbidden("You do not have permission to view this report.")


@router.get("/reports")
def report_list(user: dict = Depends(current_user)):
    return {"items": [{"key": k, "title": v["title"], "inputs": v["inputs"]} for k, v in REPORTS.items()
                      if user["role"] == "admin" or v["perm"] in user.get("permissions", [])]}


@router.get("/reports/{key}")
def report(key: str, request: Request, user: dict = Depends(current_user), ctx: AppContext = Depends(get_ctx)):
    _can_report(user, key)
    return report_service.build(ctx, user, key, _params(request))


@router.get("/reports/{key}/export")
def report_export(key: str, request: Request, format: str = "xlsx", user: dict = Depends(current_user),
                  ctx: AppContext = Depends(get_ctx)):
    _can_report(user, key)
    data = report_service.build(ctx, user, key, _params(request))
    return _file_response(ctx, user, data, format, key)


# ------------------------------------------------------------- data exports
@router.get("/export/{entity}")
def export_entity(entity: str, format: str = "xlsx", start: str = "", end: str = "",
                  user: dict = Depends(require("data.export")), ctx: AppContext = Depends(get_ctx)):
    perm = export_service.ENTITY_PERMS.get(entity)
    if perm is None:
        raise NotFound("Unknown export.")
    if user["role"] != "admin" and perm not in user.get("permissions", []):
        raise Forbidden(f"You do not have permission to export this ({perm}).")
    data = export_service.export_data(ctx, entity, start, end)
    return _file_response(ctx, user, data, format, entity)


def _file_response(ctx: AppContext, user: dict, data: dict, fmt: str, name: str) -> Response:
    if fmt not in ("xlsx", "pdf"):
        raise ValidationFailed("Format must be xlsx or pdf.")
    body = export_service.report_to_xlsx(ctx, data) if fmt == "xlsx" else export_service.report_to_pdf(ctx, data)
    fname = re.sub(r"[^A-Za-z0-9_-]", "_", f"ABHARANAM_{name}_{datetime.now().strftime('%Y-%m-%d_%H%M')}") + f".{fmt}"
    try:                                     # keep a copy in the exports folder, like a real business record
        (ctx.settings.exports_dir / fname).write_bytes(body)
    except OSError:
        pass
    audit_service.log_now(ctx, user, "DATA_EXPORTED", "export", name, f"{fname} ({len(data['sections'][0]['rows']) if data['sections'] else 0} rows)")
    return Response(body, media_type=XLSX if fmt == "xlsx" else "application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"', "Cache-Control": "no-store"})
