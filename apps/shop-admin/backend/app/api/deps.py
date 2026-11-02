"""FastAPI dependencies: who is logged in, and are they allowed to do this?"""
from __future__ import annotations

from typing import Callable

from fastapi import Depends, Request

from app.core.context import AppContext
from app.core.errors import Forbidden, Unauthorized
from app.core.security import read_token
from app.services.auth_service import effective_permissions

COOKIE_NAME = "abh_session"


def get_ctx(request: Request) -> AppContext:
    return request.app.state.ctx


def current_user(request: Request, ctx: AppContext = Depends(get_ctx)) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        header = request.headers.get("authorization", "")
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
    if not token:
        raise Unauthorized("Please log in.")
    payload = read_token(ctx.settings.secret_key, token)
    if not payload:
        raise Unauthorized("Your session has expired. Please log in again.")
    user = ctx.store.get("users", payload.get("sub", ""))
    if user is None or not user.get("active", True) or user.get("token_version", 0) != payload.get("ver"):
        raise Unauthorized("Your session is no longer valid. Please log in again.")
    return user


def require(*permissions: str) -> Callable:
    """Dependency: the user must have AT LEAST ONE of the listed permissions (admins always pass)."""

    def checker(user: dict = Depends(current_user)) -> dict:
        if user["role"] == "admin":
            return user
        have = set(effective_permissions(user))
        if permissions and not have.intersection(permissions):
            raise Forbidden("You do not have permission to do this. Please ask the administrator.")
        return user

    return checker


def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise Forbidden("Only the administrator can do this.")
    return user


def has_permission(user: dict, permission: str) -> bool:
    return user["role"] == "admin" or permission in effective_permissions(user)


def read_upload(file, limit_mb: float, what: str = "file") -> bytes:
    """Read an uploaded file but stop at the size limit (so a huge upload can never fill the computer's memory)."""
    from app.core.errors import ValidationFailed
    limit = int(limit_mb * 1024 * 1024)
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise ValidationFailed(f"The {what} is too big (maximum {limit_mb:g} MB).")
    return data
