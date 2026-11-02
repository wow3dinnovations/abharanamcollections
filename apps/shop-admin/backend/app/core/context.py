"""The application context: settings + storage + backup manager, shared by all services."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings
from app.core.security import LoginThrottle
from app.storage.backup import BackupManager
from app.storage.json_store import JsonStore


@dataclass
class AppContext:
    settings: Settings
    store: JsonStore
    backups: BackupManager
    throttle: LoginThrottle = field(default_factory=LoginThrottle)
    file_mirror: Any = None        # app.storage.cloud.FileMirror in online mode
