"""Categories, sub-categories, vendors, locations, expense categories - all editable by the admin."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from app.api.deps import current_user, get_ctx, require
from app.core.context import AppContext
from app.services import master_service
from app.services.master_service import MASTERS

router = APIRouter(prefix="/api", tags=["masters"])

PATHS = {"categories": "categories", "subcategories": "subcategories", "vendors": "vendors",
         "locations": "locations", "expense_categories": "expense-categories"}


def _register(kind: str, path: str) -> None:
    perm = MASTERS[kind]["perm"]

    @router.get(f"/{path}", name=f"list_{kind}")
    def list_items(active_only: bool = False, category_id: str = "", user: dict = Depends(current_user),
                   ctx: AppContext = Depends(get_ctx)):
        return {"items": master_service.list_items(ctx, kind, include_inactive=not active_only, category_id=category_id or None)}

    @router.post(f"/{path}", name=f"create_{kind}")
    def create_item(body: dict = Body(...), user: dict = Depends(require(perm)), ctx: AppContext = Depends(get_ctx)):
        return master_service.create(ctx, user, kind, body)

    @router.put(f"/{path}/{{rid}}", name=f"update_{kind}")
    def update_item(rid: str, body: dict = Body(...), user: dict = Depends(require(perm)),
                    ctx: AppContext = Depends(get_ctx)):
        return master_service.update(ctx, user, kind, rid, body)


for _kind, _path in PATHS.items():
    _register(_kind, _path)
