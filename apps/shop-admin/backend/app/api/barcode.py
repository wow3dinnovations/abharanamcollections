from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from pydantic import Field

from app.api.deps import get_ctx, require
from app.core.context import AppContext
from app.core.errors import NotFound
from app.schemas.common import Body, paginate
from app.services import barcode_service

router = APIRouter(prefix="/api/barcode", tags=["barcode"])
PRINT = ("barcode.print", "barcode.reprint")


class LabelItem(Body):
    product_id: str
    copies: int = 1


class LabelsIn(Body):
    items: list[LabelItem] = Field(default_factory=list)


class PrintJobIn(Body):
    items: list[LabelItem]
    label_size_id: str
    reprint_of: str = ""


@router.post("/labels")
def make_labels(body: LabelsIn, user: dict = Depends(require(*PRINT)), ctx: AppContext = Depends(get_ctx)):
    return barcode_service.labels(ctx, [i.model_dump() for i in body.items])


@router.post("/print-jobs")
def record_job(body: PrintJobIn, user: dict = Depends(require(*PRINT)), ctx: AppContext = Depends(get_ctx)):
    if body.reprint_of:
        require("barcode.reprint")(user)
    return barcode_service.record_print_job(ctx, user, [i.model_dump() for i in body.items], body.label_size_id, body.reprint_of)


@router.get("/print-jobs")
def jobs(start: str = "", end: str = "", page: int = 1, page_size: int = 20,
         user: dict = Depends(require(*PRINT)), ctx: AppContext = Depends(get_ctx)):
    return paginate(barcode_service.list_jobs(ctx, start, end), page, page_size)


@router.get("/print-jobs/{job_id}")
def job(job_id: str, user: dict = Depends(require(*PRINT)), ctx: AppContext = Depends(get_ctx)):
    j = ctx.store.get("barcode_print_jobs", job_id)
    if j is None:
        raise NotFound("Print job not found.")
    return j


@router.get("/svg/{code}")
def barcode_svg(code: str, user: dict = Depends(require(*PRINT, "inventory.view", "sales.create"))):
    return Response(barcode_service.svg(code), media_type="image/svg+xml", headers={"Cache-Control": "private, max-age=3600"})
