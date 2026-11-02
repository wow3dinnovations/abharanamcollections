"""Settings, branding and data-management routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import current_user, get_ctx, read_upload, require
from app.core.context import AppContext
from app.core.errors import NotFound
from app.schemas.common import BackupIn, RestoreIn
from app.services import data_service, settings_service

router = APIRouter(prefix="/api", tags=["system"])


# ------------------------------------------------------------- branding (public: login page needs it)
@router.get("/branding/logo")
def logo(ctx: AppContext = Depends(get_ctx)):
    path = settings_service.find_logo(ctx)
    if path is None:
        raise NotFound("No logo file has been added yet.")
    return FileResponse(path, headers={"Cache-Control": "no-cache", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox"})


@router.get("/branding")
def branding(ctx: AppContext = Depends(get_ctx)):
    return settings_service.public(ctx)


# ------------------------------------------------------------- settings
@router.get("/settings")
def get_settings(user: dict = Depends(current_user), ctx: AppContext = Depends(get_ctx)):
    return settings_service.get(ctx)


@router.put("/settings")
def put_settings(body: dict, user: dict = Depends(require("admin.settings")), ctx: AppContext = Depends(get_ctx)):
    return settings_service.update(ctx, user, body)


@router.post("/settings/logo")
def upload_logo(file: UploadFile = File(...), user: dict = Depends(require("admin.settings")),
                ctx: AppContext = Depends(get_ctx)):
    name = settings_service.save_logo(ctx, user, file.filename or "", read_upload(file, 3, "logo"))
    return {"file": name}


# ------------------------------------------------------------- data management
@router.get("/data/summary")
def data_summary(user: dict = Depends(require("admin.backup", "admin.restore", "admin.data_health")),
                 ctx: AppContext = Depends(get_ctx)):
    return data_service.summary(ctx)


@router.post("/data/backup")
def backup_now(body: BackupIn, user: dict = Depends(require("admin.backup")), ctx: AppContext = Depends(get_ctx)):
    return data_service.backup_now(ctx, user, body.reason)


@router.get("/data/backups")
def list_backups(user: dict = Depends(require("admin.backup", "admin.restore")),
                 ctx: AppContext = Depends(get_ctx)):
    return {"items": ctx.backups.list()}


@router.get("/data/backups/{name}")
def backup_detail(name: str, user: dict = Depends(require("admin.backup", "admin.restore")),
                  ctx: AppContext = Depends(get_ctx)):
    manifest = ctx.backups.get(name)
    manifest["problems"] = ctx.backups.validate(name)
    return manifest


@router.post("/data/restore")
def restore_backup(body: RestoreIn, user: dict = Depends(require("admin.restore")),
                   ctx: AppContext = Depends(get_ctx)):
    return data_service.restore(ctx, user, body.name, body.confirm, body.confirm_text)


@router.post("/data/open-folder/{which}")
def open_folder(which: str, request: Request, user: dict = Depends(require("admin.backup", "data.export")),
                ctx: AppContext = Depends(get_ctx)):
    host = request.client.host if request.client else ""
    return {"opened": data_service.open_folder(ctx, which, host)}
