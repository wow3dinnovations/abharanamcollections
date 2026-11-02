"""Emergency tool: set a new password for a user when the password has been forgotten.

Run it ONLY while the application is closed:      python reset_password.py
It asks for the username and a new password.  Passwords are never stored in plain text.
"""
from __future__ import annotations

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.core.config import load_settings  # noqa: E402
from app.core.errors import AppError  # noqa: E402
from app.core.security import check_password_strength, hash_password  # noqa: E402
from app.services import audit_service  # noqa: E402
from app.storage.json_store import JsonStore  # noqa: E402
from app.storage.registry import SPECS  # noqa: E402
from app.utils.dates import now_iso  # noqa: E402


def reset_password(base_dir: Path | None, username: str, new_password: str, scrypt_n: int | None = None) -> dict:
    """Returns the changed user.  Raises AppError with a friendly message on problems."""
    settings = load_settings(base_dir, write_env=False)
    store = JsonStore(settings.data_dir, SPECS).open()
    try:
        check_password_strength(new_password)
        key = username.strip().lower()
        user = next((u for u in store.all("users") if u["username"].lower() == key), None)
        if user is None:
            names = ", ".join(u["username"] for u in store.all("users")) or "(no users yet)"
            raise AppError(f"There is no user called '{username}'. Existing users: {names}")
        with store.transaction() as tx:
            u = tx.require("users", user["id"])
            u["password_hash"] = hash_password(new_password, scrypt_n or settings.password_scrypt_n)
            u["token_version"] = int(u.get("token_version", 0)) + 1          # signs the person out everywhere
            u["active"] = True
            u["must_change_password"] = True
            u["updated_at"] = now_iso()
            tx.put("users", u)
            audit_service.record(tx, {"id": "", "username": "reset_password.py"}, "PASSWORD_RESET", "user", u["id"],
                                 f"Password reset for '{u['username']}' with the emergency tool")
        return u
    finally:
        store.close()


def main() -> None:
    print("ABHARANAM COLLECTIONS - password reset tool")
    print("Make sure the application is CLOSED before you continue.\n")
    username = input("Username to reset: ").strip()
    pw = getpass.getpass("New password (typing is hidden): ")
    if pw != getpass.getpass("Type the new password again: "):
        print("The two passwords did not match. Nothing was changed.")
        return
    try:
        u = reset_password(None, username, pw)
    except AppError as exc:
        print("\nProblem:", exc.message)
        return
    print(f"\nDone. '{u['username']}' can now log in with the new password (and will be asked to change it).")


if __name__ == "__main__":
    main()
