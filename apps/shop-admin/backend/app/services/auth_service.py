"""Login, first-time set-up, staff accounts and passwords."""
from __future__ import annotations

from app.core.context import AppContext
from app.core.errors import Conflict, Forbidden, NotFound, Unauthorized, ValidationFailed
from app.core.permissions import ALL_PERMISSIONS
from app.core.security import (check_password_strength, hash_password, make_token, verify_password)
from app.services import audit_service
from app.utils.dates import now_iso


# ---------------------------------------------------------------- helpers
def effective_permissions(user: dict) -> list[str]:
    if user.get("role") == "admin":
        return list(ALL_PERMISSIONS)
    return [p for p in user.get("permissions", []) if p in ALL_PERMISSIONS]


def public_user(user: dict) -> dict:
    out = {k: v for k, v in user.items() if k not in ("password_hash", "token_version")}
    out["permissions"] = effective_permissions(user)
    out["assigned_permissions"] = list(user.get("permissions", []))
    return out


def _find_by_login(ctx: AppContext, login: str) -> dict | None:
    key = (login or "").strip().lower()
    if not key:
        return None
    for u in ctx.store.all("users"):
        if u["username"].lower() == key or (u.get("email") or "").lower() == key:
            return u
    return None


def _normalise_username(name: str) -> str:
    name = (name or "").strip().lower()
    if len(name) < 3 or any(c.isspace() for c in name):
        raise ValidationFailed("Username must be at least 3 characters with no spaces.")
    return name


def _clean_perms(perms: list[str] | None) -> list[str]:
    perms = perms or []
    unknown = [p for p in perms if p not in ALL_PERMISSIONS]
    if unknown:
        raise ValidationFailed(f"Unknown permission: {unknown[0]}")
    return sorted(set(perms))


# ---------------------------------------------------------------- first-time set-up
def needs_setup(ctx: AppContext) -> bool:
    return len(ctx.store.all("users")) == 0


def create_first_admin(ctx: AppContext, username: str, password: str, full_name: str, email: str = "") -> dict:
    if not needs_setup(ctx):
        raise Forbidden("Set-up has already been completed. Please log in.")
    check_password_strength(password)
    user = None
    with ctx.store.transaction() as tx:
        user = {
            "id": tx.next_id("USR", 4), "username": _normalise_username(username),
            "full_name": (full_name or "").strip() or "Administrator", "email": (email or "").strip(),
            "password_hash": hash_password(password, ctx.settings.password_scrypt_n),
            "role": "admin", "permissions": [], "active": True, "token_version": 0,
            "max_discount_percent": None, "max_discount_amount": None,
            "must_change_password": False, "created_at": now_iso(), "last_login": None,
        }
        tx.insert("users", user)
        audit_service.record(tx, user, "STAFF_CREATED", "user", user["id"], "First administrator created")
    return user


# ---------------------------------------------------------------- login / logout
def login(ctx: AppContext, login_name: str, password: str) -> tuple[dict, str]:
    key = (login_name or "").strip().lower()
    if ctx.throttle.blocked(key):
        raise Unauthorized("Too many wrong attempts. Please wait 5 minutes and try again.",
                           code="LOGIN_LOCKED", status_code=429)
    user = _find_by_login(ctx, key)
    if user is None or not verify_password(password or "", user["password_hash"]):
        ctx.throttle.fail(key)
        audit_service.log_now(ctx, user, "LOGIN_FAILED", "user", (user or {}).get("id", ""),
                              f"Failed login for '{key}'")
        raise Unauthorized("Wrong username or password.")
    if not user.get("active", True):
        raise Unauthorized("This account has been disabled. Please contact the administrator.")
    ctx.throttle.clear(key)
    with ctx.store.transaction() as tx:
        u = tx.require("users", user["id"])
        u["last_login"] = now_iso()
        tx.put("users", u)
        audit_service.record(tx, u, "LOGIN", "user", u["id"], "Logged in")
    token = make_token(ctx.settings.secret_key, user["id"], user.get("token_version", 0),
                       ctx.settings.session_hours)
    return ctx.store.get("users", user["id"]), token


def logout(ctx: AppContext, user: dict) -> None:
    audit_service.log_now(ctx, user, "LOGOUT", "user", user["id"], "Logged out")


def change_password(ctx: AppContext, user: dict, current: str, new: str) -> str:
    if not verify_password(current or "", user["password_hash"]):
        raise ValidationFailed("Your current password is not correct.")
    check_password_strength(new)
    if current == new:
        raise ValidationFailed("The new password must be different from the current one.")
    with ctx.store.transaction() as tx:
        u = tx.require("users", user["id"])
        u["password_hash"] = hash_password(new, ctx.settings.password_scrypt_n)
        u["token_version"] = int(u.get("token_version", 0)) + 1
        u["must_change_password"] = False
        tx.put("users", u)
        audit_service.record(tx, u, "PASSWORD_CHANGED", "user", u["id"], "Changed own password")
    return make_token(ctx.settings.secret_key, user["id"], u["token_version"], ctx.settings.session_hours)


# ---------------------------------------------------------------- staff management
def list_users(ctx: AppContext) -> list[dict]:
    return [public_user(u) for u in ctx.store.all("users")]


def create_user(ctx: AppContext, admin: dict, data: dict) -> dict:
    username = _normalise_username(data["username"])
    check_password_strength(data["password"])
    perms = _clean_perms(data.get("permissions"))
    if data.get("role", "staff") not in ("admin", "staff"):
        raise ValidationFailed("Role must be admin or staff.")
    with ctx.store.transaction() as tx:
        if any(u["username"].lower() == username for u in tx.iter_all("users")):
            raise Conflict(f"The username '{username}' is already taken.")
        user = {
            "id": tx.next_id("USR", 4), "username": username,
            "full_name": (data.get("full_name") or "").strip() or username,
            "email": (data.get("email") or "").strip(),
            "password_hash": hash_password(data["password"], ctx.settings.password_scrypt_n),
            "role": data.get("role", "staff"), "permissions": perms, "active": True, "token_version": 0,
            "max_discount_percent": data.get("max_discount_percent"),
            "max_discount_amount": data.get("max_discount_amount"),
            "must_change_password": bool(data.get("must_change_password", False)),
            "created_at": now_iso(), "last_login": None,
        }
        tx.insert("users", user)
        audit_service.record(tx, admin, "STAFF_CREATED", "user", user["id"],
                             f"Created {user['role']} '{username}' with {len(perms)} permissions")
    return public_user(user)


def update_user(ctx: AppContext, admin: dict, user_id: str, data: dict) -> dict:
    with ctx.store.transaction() as tx:
        u = tx.require("users", user_id, "User")
        before_perms = set(u.get("permissions", []))
        was_admin, was_active = u["role"] == "admin", u.get("active", True)
        for key in ("full_name", "email", "max_discount_percent", "max_discount_amount"):
            if key in data:
                u[key] = data[key].strip() if isinstance(data[key], str) else data[key]
        if "permissions" in data and data["permissions"] is not None:
            u["permissions"] = _clean_perms(data["permissions"])
        if data.get("role") in ("admin", "staff"):
            u["role"] = data["role"]
        if "active" in data and data["active"] is not None:
            u["active"] = bool(data["active"])
        # never lock the business out of its own system
        if (was_admin and (u["role"] != "admin" or not u["active"])):
            others = [x for x in tx.iter_all("users")
                      if x["id"] != user_id and x["role"] == "admin" and x.get("active", True)]
            if not others:
                raise Conflict("There must always be at least one active Admin.")
        if u["id"] == admin["id"] and not u["active"]:
            raise Conflict("You cannot disable your own account.")
        if (before_perms != set(u["permissions"]) or was_admin != (u["role"] == "admin")
                or (was_active and not u["active"])):
            u["token_version"] = int(u.get("token_version", 0)) + 1     # sign the person out so changes apply
        tx.put("users", u)
        after = set(u["permissions"])
        if before_perms != after:
            audit_service.record(tx, admin, "PERMISSION_CHANGED", "user", u["id"],
                                 {"added": sorted(after - before_perms), "removed": sorted(before_perms - after)})
        audit_service.record(tx, admin, "STAFF_UPDATED", "user", u["id"],
                             f"Updated '{u['username']}' (active={u['active']}, role={u['role']})")
    return public_user(u)


def reset_password(ctx: AppContext, admin: dict, user_id: str, new_password: str) -> None:
    check_password_strength(new_password)
    with ctx.store.transaction() as tx:
        u = tx.require("users", user_id, "User")
        u["password_hash"] = hash_password(new_password, ctx.settings.password_scrypt_n)
        u["token_version"] = int(u.get("token_version", 0)) + 1
        u["must_change_password"] = True
        tx.put("users", u)
        audit_service.record(tx, admin, "PASSWORD_RESET", "user", u["id"], f"Password reset for '{u['username']}'")


# ---------------------------------------------------------------- roles (permission templates)
def list_roles(ctx: AppContext) -> list[dict]:
    return list(ctx.store.all("roles"))


def save_role(ctx: AppContext, admin: dict, role_id: str | None, name: str, description: str,
              permissions: list[str]) -> dict:
    perms = _clean_perms(permissions)
    if not (name or "").strip():
        raise ValidationFailed("Role name is required.")
    with ctx.store.transaction() as tx:
        if role_id:
            r = tx.require("roles", role_id, "Role")
            if r.get("is_system"):
                raise Forbidden("The Admin role cannot be changed.")
            r.update({"name": name.strip(), "description": description, "permissions": perms})
            tx.put("roles", r)
        else:
            if any(x["name"].lower() == name.strip().lower() for x in tx.iter_all("roles")):
                raise Conflict("A role with that name already exists.")
            r = {"id": tx.next_id("ROLE", 3), "name": name.strip(), "description": description,
                 "permissions": perms, "is_system": False}
            tx.insert("roles", r)
        audit_service.record(tx, admin, "PERMISSION_CHANGED", "role", r["id"], f"Saved role '{r['name']}'")
    return r
