"""Serve uploaded pictures / receipts.  Only known sub-folders and plain filenames are allowed."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.api.deps import current_user, get_ctx, require
from app.core.context import AppContext
from app.core.errors import NotFound

router = APIRouter(prefix="/api/files", tags=["files"])
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-]{0,120}$")
MEDIA = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf"}


def _serve(ctx: AppContext, folder: str, filename: str):
    if not NAME_RE.match(filename):
        raise NotFound("File not found.")
    base = (ctx.settings.uploads_dir / folder).resolve()
    path = (base / filename).resolve()
    if path.parent != base or not path.is_file():
        raise NotFound("File not found.")
    media = MEDIA.get(path.suffix.lower())
    if media is None:
        raise NotFound("File not found.")
    disposition = "inline"
    return FileResponse(path, media_type=media, headers={
        "Content-Disposition": f'{disposition}; filename="{path.name}"', "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"})


@router.get("/products/{filename}")
def product_file(filename: str, user: dict = Depends(current_user), ctx: AppContext = Depends(get_ctx)):
    return _serve(ctx, "products", filename)


@router.get("/expenses/{filename}")
def expense_file(filename: str, user: dict = Depends(require("expenses.view")), ctx: AppContext = Depends(get_ctx)):
    return _serve(ctx, "expenses", filename)
