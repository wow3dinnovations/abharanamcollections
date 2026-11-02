"""ABHARANAM COLLECTIONS - application entry point."""
from __future__ import annotations

import logging
import logging.handlers
import os
from urllib.parse import urlparse
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import auth as auth_api
from app.api import system as system_api
from app.core.config import APP_VERSION, Settings, load_settings
from app.core.context import AppContext
from app.core.errors import AppError
from app.services import bootstrap
from app.services.data_service import AutoBackup
from app.services.website_sync import AutoPublish
from app.storage.backup import BackupManager
from app.storage.json_store import JsonStore
from app.storage.registry import SPECS

log = logging.getLogger("abharanam")


def setup_logging(settings: Settings) -> None:
    root = logging.getLogger()
    if any(getattr(h, "_abh", False) for h in root.handlers):
        return
    handler = logging.handlers.RotatingFileHandler(settings.logs_dir / "app.log", maxBytes=2_000_000,
                                                   backupCount=5, encoding="utf-8")
    handler._abh = True  # type: ignore[attr-defined]
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    root.addHandler(handler)
    root.setLevel(logging.INFO)


def build_context(settings: Settings, cloud_factory=None) -> AppContext:
    store = JsonStore(settings.data_dir, SPECS)
    mirror = None
    if settings.cloud:
        # Online: Supabase is the master copy.  Bring everything down before opening.
        from app.storage import cloud
        store.remote, mirror = cloud.connect(settings.base_dir, cloud_factory)
        files = mirror.pull()
        records = store.seed_from_remote()
        log.info("Online mode: loaded %s records and %s files from Supabase", records, files)
    store.open()
    backups = BackupManager(store, settings.backup_dir)
    ctx = AppContext(settings=settings, store=store, backups=backups)
    ctx.file_mirror = mirror
    bootstrap.bootstrap(ctx)
    if mirror is not None:
        mirror.sync()
        mirror.start()
    return ctx


def create_app(settings: Settings | None = None, *, auto_backup: bool = True, cloud_factory=None) -> FastAPI:
    settings = settings or load_settings()
    setup_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        ctx = build_context(settings, cloud_factory)
        app.state.ctx = ctx
        worker = publisher = None
        if auto_backup:
            worker = AutoBackup(ctx)
            worker.start()
            publisher = AutoPublish(ctx)
            publisher.start()
        log.info("ABHARANAM COLLECTIONS %s started. Data folder: %s", APP_VERSION, settings.data_dir)
        try:
            yield
        finally:
            if worker:
                worker.stop()
            if publisher:
                publisher.stop()
            if ctx.file_mirror is not None:
                ctx.file_mirror.stop()
            ctx.store.close()

    debug = os.environ.get("ABH_DEBUG") == "1"       # the developer API pages are off unless explicitly switched on
    app = FastAPI(title="ABHARANAM COLLECTIONS", version=APP_VERSION, lifespan=lifespan, redoc_url=None,
                  docs_url="/api/docs" if debug else None, openapi_url="/api/openapi.json" if debug else None)

    # ------------------------------------------------------------ friendly errors, never stack traces
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):
        body = {"detail": exc.message, "code": exc.code}
        body.update(exc.extra)
        return JSONResponse(body, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):
        errors = []
        for e in exc.errors():
            loc = [str(p) for p in e.get("loc", []) if p not in ("body", "query", "path")]
            errors.append({"field": ".".join(loc), "message": e.get("msg", "invalid")})
        first = errors[0] if errors else {"field": "", "message": "invalid request"}
        label = f"{first['field']}: " if first["field"] else ""
        return JSONResponse({"detail": f"Please check the form - {label}{first['message']}",
                             "code": "VALIDATION_ERROR", "errors": errors}, status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        return JSONResponse({"detail": exc.detail if isinstance(exc.detail, str) else "Request failed",
                             "code": "HTTP_ERROR"}, status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception):
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Something went wrong on our side. Your data was not changed. "
                                       "Please try again. If it keeps happening, check Data Health.",
                             "code": "INTERNAL_ERROR"}, status_code=500)

    @app.middleware("http")
    async def _security_headers(request: Request, call_next):
        # Cross-site request forgery guard: a browser always says which site a change request came from.
        # If it names a different site than the one being called, refuse (the login cookie is also SameSite=Lax).
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            origin = request.headers.get("origin")
            if origin and origin != "null" and urlparse(origin).netloc != request.headers.get("host", ""):
                return JSONResponse({"detail": "This request came from another website and was blocked.", "code": "CROSS_SITE"}, status_code=403)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        if not request.url.path.startswith("/api/"):
            response.headers.setdefault("Content-Security-Policy",
                                        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
                                        "font-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'")
        return response

    @app.get("/api/health")
    def health():
        ctx: AppContext = app.state.ctx
        return {"status": "ok", "version": APP_VERSION,
                "data_problem": [m.name + ".json" for m in ctx.store.corrupted()]}

    app.include_router(auth_api.router)
    app.include_router(system_api.router)
    register_more_routers(app)

    # ------------------------------------------------------------ serve the built web screens
    dist: Path = settings.frontend_dist
    if dist.exists() and (dist / "index.html").exists():
        if (dist / "assets").exists():
            app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse({"detail": "Not found", "code": "NOT_FOUND"}, status_code=404)
            candidate = (dist / path).resolve()
            if path and dist.resolve() in candidate.parents and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})

    return app


def register_more_routers(app: FastAPI) -> None:
    """Routers for the business modules."""
    from app.api import barcode, data, files, inventory, masters, products, reports, sales, website
    for module in (masters, products, inventory, files, barcode, sales, reports, data, website):
        app.include_router(module.router)


app = None


def get_app() -> FastAPI:
    global app
    if app is None:
        app = create_app()
    return app
