from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.api.deps import COOKIE_NAME, current_user, get_ctx, require, require_admin
from app.core.context import AppContext
from app.core.errors import Forbidden
from app.core.permissions import PERMISSION_GROUPS
from app.schemas.common import (ChangePasswordIn, LoginIn, ResetPasswordIn, RoleIn, SetupIn,
                                UserCreateIn, UserUpdateIn)
from app.services import auth_service, settings_service

router = APIRouter(prefix="/api", tags=["auth & staff"])


def _check_delegation(actor: dict, perms, target_id: str | None = None) -> None:
    """A non-admin with 'Manage Staff' may not give out permissions they do not hold themselves."""
    if actor["role"] == "admin" or perms is None:
        return
    if target_id == actor["id"]:
        raise Forbidden("You cannot change your own permissions.")
    mine = set(auth_service.effective_permissions(actor))
    extra = [p for p in perms if p not in mine]
    if extra:
        raise Forbidden("You can only give permissions that you have yourself.")


def _set_cookie(ctx: AppContext, response: Response, token: str) -> None:
    response.set_cookie(COOKIE_NAME, token, max_age=ctx.settings.session_hours * 3600, httponly=True,
                        samesite="lax", secure=ctx.settings.cookie_secure, path=ctx.settings.base_path or "/")


@router.get("/auth/setup-status")
def setup_status(ctx: AppContext = Depends(get_ctx)):
    return {"needs_setup": auth_service.needs_setup(ctx), "business": settings_service.public(ctx)}


@router.post("/auth/setup")
def setup(body: SetupIn, response: Response, ctx: AppContext = Depends(get_ctx)):
    auth_service.create_first_admin(ctx, body.username, body.password, body.full_name, body.email)
    user, token = auth_service.login(ctx, body.username, body.password)
    _set_cookie(ctx, response, token)
    return {"user": auth_service.public_user(user)}


@router.post("/auth/login")
def login(body: LoginIn, response: Response, ctx: AppContext = Depends(get_ctx)):
    user, token = auth_service.login(ctx, body.username, body.password)
    _set_cookie(ctx, response, token)
    return {"user": auth_service.public_user(user)}


@router.post("/auth/logout")
def logout(response: Response, user: dict = Depends(current_user), ctx: AppContext = Depends(get_ctx)):
    auth_service.logout(ctx, user)
    response.delete_cookie(COOKIE_NAME, path=ctx.settings.base_path or "/")
    return {"ok": True}


@router.get("/auth/me")
def me(user: dict = Depends(current_user)):
    return {"user": auth_service.public_user(user)}


@router.post("/auth/change-password")
def change_password(body: ChangePasswordIn, response: Response, user: dict = Depends(current_user),
                    ctx: AppContext = Depends(get_ctx)):
    token = auth_service.change_password(ctx, user, body.current_password, body.new_password)
    _set_cookie(ctx, response, token)
    return {"ok": True}


# ------------------------------------------------------------- staff
@router.get("/users")
def list_users(user: dict = Depends(require("admin.staff")), ctx: AppContext = Depends(get_ctx)):
    return {"items": auth_service.list_users(ctx)}


@router.post("/users")
def create_user(body: UserCreateIn, user: dict = Depends(require("admin.staff")),
                ctx: AppContext = Depends(get_ctx)):
    data = body.model_dump()
    _check_delegation(user, data.get("permissions"))
    if data.get("role") == "admin" and user["role"] != "admin":
        data["role"] = "staff"      # only an Admin can create another Admin
    return auth_service.create_user(ctx, user, data)


@router.put("/users/{user_id}")
def update_user(user_id: str, body: UserUpdateIn, user: dict = Depends(require("admin.staff")),
                ctx: AppContext = Depends(get_ctx)):
    data = body.model_dump(exclude_unset=True)
    _check_delegation(user, data.get("permissions"), user_id)
    target = ctx.store.require("users", user_id, "User")
    if user["role"] != "admin" and (target["role"] == "admin" or data.get("role") == "admin"):
        data.pop("role", None)
        if target["role"] == "admin":
            raise Forbidden("Only an Admin can change an Admin account.")
    return auth_service.update_user(ctx, user, user_id, data)


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, body: ResetPasswordIn, user: dict = Depends(require("admin.staff")),
                   ctx: AppContext = Depends(get_ctx)):
    target = ctx.store.require("users", user_id, "User")
    if user["role"] != "admin" and target["role"] == "admin":
        raise Forbidden("Only an Admin can reset an Admin password.")
    auth_service.reset_password(ctx, user, user_id, body.new_password)
    return {"ok": True}


@router.get("/permissions")
def permissions(user: dict = Depends(current_user)):
    return {"groups": [{"group": g, "items": [{"key": k, "label": l} for k, l in items]}
                       for g, items in PERMISSION_GROUPS]}


@router.get("/roles")
def roles(user: dict = Depends(require("admin.staff")), ctx: AppContext = Depends(get_ctx)):
    return {"items": auth_service.list_roles(ctx)}


@router.post("/roles")
def create_role(body: RoleIn, user: dict = Depends(require_admin), ctx: AppContext = Depends(get_ctx)):
    return auth_service.save_role(ctx, user, None, body.name, body.description, body.permissions)


@router.put("/roles/{role_id}")
def update_role(role_id: str, body: RoleIn, user: dict = Depends(require_admin),
                ctx: AppContext = Depends(get_ctx)):
    return auth_service.save_role(ctx, user, role_id, body.name, body.description, body.permissions)
