"""Application configuration.

Reads settings from environment variables / backend/.env.  Business data is
NEVER kept here - only technical configuration.
"""
from __future__ import annotations

import hashlib
import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

APP_VERSION = "1.0.0"
BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_BASE_DIR = BACKEND_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"


def _ensure_secret_key(env_file: Path) -> str:
    """Return SECRET_KEY, generating and saving one on first start."""
    key = os.environ.get("SECRET_KEY", "").strip()
    if key:
        return key
    key = secrets.token_hex(32)
    try:
        lines = env_file.read_text(encoding="utf-8").splitlines() if env_file.exists() else []
        lines = [ln for ln in lines if not ln.startswith("SECRET_KEY=")]
        lines.append(f"SECRET_KEY={key}")
        env_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError:
        pass  # keep the in-memory key; sessions just won't survive a restart
    os.environ["SECRET_KEY"] = key
    return key


@dataclass
class Settings:
    base_dir: Path
    secret_key: str
    host: str = "127.0.0.1"
    port: int = 8000
    session_hours: int = 12
    auto_backup_hours: float = 12
    auto_backup_keep: int = 30
    password_scrypt_n: int = 2**14
    cookie_secure: bool = False
    base_path: str = ""            # "/shop-admin" when served online under the website's address
    cloud: bool = False            # online mode: data saved in Supabase (see app/storage/cloud.py)
    data_dir: Path = field(init=False)
    backup_dir: Path = field(init=False)
    uploads_dir: Path = field(init=False)
    invoices_dir: Path = field(init=False)
    labels_dir: Path = field(init=False)
    exports_dir: Path = field(init=False)
    logs_dir: Path = field(init=False)
    logo_dir: Path = field(init=False)
    frontend_dist: Path = field(init=False)

    def __post_init__(self) -> None:
        b = self.base_dir
        self.data_dir = b / "data"
        self.backup_dir = b / "backups"
        self.uploads_dir = b / "uploads"
        self.invoices_dir = b / "invoices"
        self.labels_dir = b / "barcode_labels"
        self.exports_dir = b / "exports"
        self.logs_dir = b / "logs"
        self.logo_dir = b / "assets" / "logo"
        self.frontend_dist = b / "frontend" / "dist"

    def url(self, path: str) -> str:
        """Address the browser uses for one of our own paths (adds /shop-admin online)."""
        return f"{self.base_path}{path}"

    def ensure_dirs(self) -> None:
        for d in (self.data_dir, self.backup_dir, self.uploads_dir / "products",
                  self.uploads_dir / "expenses", self.uploads_dir / "imports",
                  self.invoices_dir, self.labels_dir, self.exports_dir,
                  self.logs_dir, self.logo_dir):
            d.mkdir(parents=True, exist_ok=True)


def load_settings(base_dir: Path | None = None, *, write_env: bool = True) -> Settings:
    load_dotenv(ENV_FILE)
    base = Path(base_dir or os.environ.get("ABH_BASE_DIR") or DEFAULT_BASE_DIR).resolve()
    cloud = os.environ.get("SHOP_CLOUD", "").strip() == "1"
    service_key = os.environ.get("WEBSITE_SUPABASE_SERVICE_KEY", "").strip()
    if cloud and not os.environ.get("SECRET_KEY", "").strip() and service_key:
        # Online the container's disk is temporary, so derive a stable login-signing key from a secret it already has.
        key = hashlib.sha256(f"abharanam-shop-session:{service_key}".encode()).hexdigest()
    elif write_env:
        key = _ensure_secret_key(ENV_FILE)
    else:
        key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
    s = Settings(
        base_dir=base,
        secret_key=key,
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        session_hours=int(os.environ.get("SESSION_HOURS", "12")),
        auto_backup_hours=float(os.environ.get("AUTO_BACKUP_HOURS", "12")),
        auto_backup_keep=int(os.environ.get("AUTO_BACKUP_KEEP", "30")),
        password_scrypt_n=int(os.environ.get("PASSWORD_SCRYPT_N", str(2**14))),
        cookie_secure=os.environ.get("COOKIE_SECURE") == "1" or cloud,
        base_path=("/" + os.environ.get("BASE_PATH", "").strip().strip("/")).rstrip("/"),
        cloud=cloud,
    )
    s.ensure_dirs()
    return s
