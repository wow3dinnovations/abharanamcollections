"""Audit log, data health, product import and demo data."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import Response

from app.api.deps import get_ctx, read_upload, require, require_admin
from app.core.context import AppContext
from app.core.errors import ValidationFailed
from app.schemas.common import Body, paginate
from app.services import demo_service, health_service, import_service
from app.utils.dates import date_of, in_range

router = APIRouter(prefix="/api", tags=["data"])
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ------------------------------------------------------------- audit log
@router.get("/audit-logs")
def audit_logs(user_id: str = "", action: str = "", entity: str = "", q: str = "", start: str = "", end: str = "",
               page: int = 1, page_size: int = 30, user: dict = Depends(require("admin.audit_logs")),
               ctx: AppContext = Depends(get_ctx)):
    ql = q.strip().lower()
    rows = []
    for a in reversed(ctx.store.all("audit_logs")):
        if user_id and a["user_id"] != user_id:
            continue
        if action and a["action"] != action:
            continue
        if entity and a.get("entity") != entity:
            continue
        if (start or end) and not in_range(date_of(a["timestamp"]), start or None, end or None):
            continue
        if ql and ql not in f"{a['username']} {a['action']} {a.get('entity_id', '')} {a['details']}".lower():
            continue
        rows.append(a)
    result = paginate(rows, page, page_size)
    from app.services.audit_service import ACTIONS
    result["actions"] = ACTIONS
    return result


# ------------------------------------------------------------- data health
@router.get("/data/health")
def data_health(user: dict = Depends(require("admin.data_health")), ctx: AppContext = Depends(get_ctx)):
    return health_service.run(ctx)


# ------------------------------------------------------------- product import
class MappingIn(Body):
    import_id: str
    mapping: dict[str, str] = {}


@router.get("/import/products/template")
def import_template(user: dict = Depends(require("data.import"))):
    return Response(import_service.template(), media_type=XLSX,
                    headers={"Content-Disposition": 'attachment; filename="ABHARANAM_product_import_template.xlsx"'})


@router.post("/import/products/preview")
def import_preview(file: UploadFile = File(...), user: dict = Depends(require("data.import")), ctx: AppContext = Depends(get_ctx)):
    return import_service.preview(ctx, file.filename or "", read_upload(file, 8, "file"))


@router.post("/import/products/validate")
def import_validate(body: MappingIn, user: dict = Depends(require("data.import")), ctx: AppContext = Depends(get_ctx)):
    return import_service.validate(ctx, user, body.import_id, body.mapping)


@router.post("/import/products/error-report")
def import_error_report(body: MappingIn, user: dict = Depends(require("data.import")), ctx: AppContext = Depends(get_ctx)):
    result = import_service.validate(ctx, user, body.import_id, body.mapping)
    return Response(import_service.error_report(result["errors"]), media_type=XLSX,
                    headers={"Content-Disposition": 'attachment; filename="ABHARANAM_import_errors.xlsx"'})


class CommitIn(MappingIn):
    confirm: bool = False


@router.post("/import/products/commit")
def import_commit(body: CommitIn, user: dict = Depends(require("data.import", "inventory.add_product")),
                  ctx: AppContext = Depends(get_ctx)):
    if not body.confirm:
        raise ValidationFailed("Please confirm the import.")
    if user["role"] != "admin" and "inventory.add_product" not in user.get("permissions", []):
        raise ValidationFailed("Adding products needs the 'Add Product' permission too.")
    return import_service.commit(ctx, user, body.import_id, body.mapping)


# ------------------------------------------------------------- demo data
class ConfirmIn(Body):
    confirm_text: str = ""


@router.get("/data/demo")
def demo_status(user: dict = Depends(require_admin), ctx: AppContext = Depends(get_ctx)):
    return demo_service.status(ctx)


@router.post("/data/demo/load")
def demo_load(user: dict = Depends(require_admin), ctx: AppContext = Depends(get_ctx)):
    return demo_service.load(ctx, user)


@router.post("/data/demo/remove")
def demo_remove(body: ConfirmIn, user: dict = Depends(require_admin), ctx: AppContext = Depends(get_ctx)):
    if body.confirm_text.strip().upper() != "REMOVE DEMO":
        raise ValidationFailed("Please type REMOVE DEMO to confirm. Nothing was changed.")
    return demo_service.remove(ctx, user)


# ------------------------------------------------------------- export everything
@router.post("/data/export-all")
def export_all(user: dict = Depends(require("admin.backup")), ctx: AppContext = Depends(get_ctx)):
    """One zip with all data files + pictures - for moving the shop to another computer."""
    from datetime import datetime
    name = f"ABHARANAM_all_data_{datetime.now().strftime('%Y-%m-%d_%H%M%S')}.zip"
    path = ctx.settings.exports_dir / name
    ctx.backups.export_zip(path, {"uploads/products": ctx.settings.uploads_dir / "products",
                                  "uploads/expenses": ctx.settings.uploads_dir / "expenses",
                                  "assets/logo": ctx.settings.logo_dir})
    from app.services import audit_service
    audit_service.log_now(ctx, user, "DATA_EXPORTED", "export", "all_data", name)
    return Response(path.read_bytes(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})
