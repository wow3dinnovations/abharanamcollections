"""Small request/response building blocks shared by many routes."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class Body(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


def paginate(items: list, page: int, page_size: int) -> dict[str, Any]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 500)
    start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "total": len(items), "page": page,
            "page_size": page_size, "pages": max((len(items) + page_size - 1) // page_size, 1)}


class LoginIn(Body):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class SetupIn(Body):
    username: str
    password: str
    full_name: str = ""
    email: str = ""


class ChangePasswordIn(Body):
    current_password: str
    new_password: str


class ResetPasswordIn(Body):
    new_password: str


class UserCreateIn(Body):
    username: str
    password: str
    full_name: str = ""
    email: str = ""
    role: str = "staff"
    permissions: list[str] = []
    max_discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    max_discount_amount: Optional[float] = Field(default=None, ge=0)
    must_change_password: bool = False


class UserUpdateIn(Body):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    permissions: Optional[list[str]] = None
    active: Optional[bool] = None
    max_discount_percent: Optional[float] = Field(default=None, ge=0, le=100)
    max_discount_amount: Optional[float] = Field(default=None, ge=0)


class RoleIn(Body):
    name: str
    description: str = ""
    permissions: list[str] = []


class RestoreIn(Body):
    name: str
    confirm: bool = False
    confirm_text: str = ""


class BackupIn(Body):
    reason: str = ""
