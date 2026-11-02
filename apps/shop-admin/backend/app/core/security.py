"""Password hashing and login tokens.  No plain-text passwords are ever stored."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import time
from datetime import datetime, timedelta, timezone

import jwt

from app.core.errors import ValidationFailed

_R, _P = 8, 1


def hash_password(password: str, n: int = 2**14) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=_R, p=_P, dklen=32,
                            maxmem=128 * 1024 * 1024)
    return "scrypt${}${}${}${}${}".format(
        n, _R, _P, base64.b64encode(salt).decode(), base64.b64encode(digest).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        salt, expected = base64.b64decode(salt_b64), base64.b64decode(hash_b64)
        digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p),
                                dklen=len(expected), maxmem=128 * 1024 * 1024)
        return hmac.compare_digest(digest, expected)
    except Exception:
        return False


def check_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValidationFailed("Password must be at least 8 characters long.")
    if password.isdigit() or password.isalpha():
        raise ValidationFailed("Password must contain both letters and numbers.")


def make_token(secret: str, user_id: str, token_version: int, hours: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "ver": token_version, "iat": int(now.timestamp()),
               "exp": int((now + timedelta(hours=hours)).timestamp())}
    return jwt.encode(payload, secret, algorithm="HS256")


def read_token(secret: str, token: str) -> dict | None:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


class LoginThrottle:
    """Slow down password guessing: 5 wrong tries -> 5 minute pause for that username."""

    def __init__(self, max_tries: int = 5, window_seconds: int = 300):
        self.max_tries = max_tries
        self.window = window_seconds
        self._fails: dict[str, list[float]] = {}

    def _recent(self, key: str) -> list[float]:
        cutoff = time.time() - self.window
        items = [t for t in self._fails.get(key, []) if t > cutoff]
        self._fails[key] = items
        return items

    def blocked(self, key: str) -> bool:
        return len(self._recent(key)) >= self.max_tries

    def fail(self, key: str) -> None:
        self._recent(key).append(time.time())

    def clear(self, key: str) -> None:
        self._fails.pop(key, None)


SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_filename(name: str) -> str:
    base = os.path.basename(name or "file").strip().replace(" ", "_")
    base = SAFE_FILENAME_RE.sub("", base).lstrip(".")
    return base[:80] or "file"
