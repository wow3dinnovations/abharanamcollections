"""Administration -> Website: publish the catalog to the customer website and app."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_ctx, require
from app.core.context import AppContext
from app.services import audit_service, website_sync

router = APIRouter(prefix="/api/website", tags=["website"])


class PublishIn(BaseModel):
    force: bool = False


@router.get("/status")
def status(user: dict = Depends(require("website.publish")), ctx: AppContext = Depends(get_ctx)):
    return website_sync.status(ctx)


@router.post("/publish")
def publish(body: PublishIn, user: dict = Depends(require("website.publish")), ctx: AppContext = Depends(get_ctx)):
    result = website_sync.run_sync(ctx, force=body.force, trigger="manual")
    with ctx.store.transaction() as tx:
        audit_service.record(tx, user, "WEBSITE_PUBLISHED", "website", "catalog",
                             f"Published {result['products_sent']} changed products to the website")
    return {**result, "status": website_sync.status(ctx)}
