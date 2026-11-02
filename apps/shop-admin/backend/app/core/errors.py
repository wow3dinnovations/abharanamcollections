"""Friendly application errors.  The API turns these into clean JSON - never a stack trace."""
from __future__ import annotations


class AppError(Exception):
    status_code = 400
    code = "ERROR"

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None,
                 extra: dict | None = None):
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code
        self.extra = extra or {}


class ValidationFailed(AppError):
    status_code = 422
    code = "VALIDATION_ERROR"


class NotFound(AppError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(AppError):
    status_code = 409
    code = "CONFLICT"


class Unauthorized(AppError):
    status_code = 401
    code = "UNAUTHORIZED"


class Forbidden(AppError):
    status_code = 403
    code = "FORBIDDEN"


class StorageError(AppError):
    status_code = 500
    code = "STORAGE_ERROR"


class DataCorrupted(AppError):
    """A critical data file cannot be read.  Admin must restore a backup."""
    status_code = 503
    code = "DATA_CORRUPTED"

    def __init__(self, filename: str, detail: str = ""):
        super().__init__(
            f"{filename} appears to be corrupted. Please restore a backup "
            f"(Administration > Backup & Restore).",
            extra={"file": filename, "reason": detail},
        )
        self.filename = filename
