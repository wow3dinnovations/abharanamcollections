"""ONE TIME: copy the shop computer's data, photos, logo and backups to the online shop software.

Close the application first, then double-click scripts\\upload-to-cloud.bat.

Needs WEBSITE_SUPABASE_URL and WEBSITE_SUPABASE_SERVICE_KEY in backend\\.env (the same values as for publishing
to the website).  Your local data is only read, never changed.
"""
from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
load_dotenv(Path(__file__).resolve().parent / ".env")

from app.core.config import DEFAULT_BASE_DIR  # noqa: E402
from app.storage import cloud  # noqa: E402
from app.storage.json_store import JsonStore  # noqa: E402
from app.storage.registry import SPECS  # noqa: E402


def main(base_dir: Path = DEFAULT_BASE_DIR, *, assume_yes: bool = False, client_factory=None) -> int:
    store = JsonStore(base_dir / "data", SPECS)
    store.open()                                  # also refuses if the application is still running
    try:
        bad = [m.name for m in store.corrupted()]
        if bad:
            print(f"These data files are damaged: {', '.join(bad)}. Restore a backup first. Nothing was uploaded.")
            return 1
        records, mirror = cloud.connect(base_dir, client_factory)
        online = records.collections()
        has_data = any(int(c.get("records") or 0) for c in online)
        counts = {s.name: store.count(s.name) for s in SPECS if s.kind == "list"}
        print(f"Products: {counts.get('products', 0)}, sales: {counts.get('sales', 0)}, "
              f"customers: {counts.get('customers', 0)}, users: {counts.get('users', 0)}")
        if has_data and not assume_yes:
            answer = input("The online shop software already has data. Replace it with this computer's data? "
                           "Type YES to continue: ")
            if answer.strip() != "YES":
                print("Nothing was uploaded.")
                return 1
        cols = []
        for spec in SPECS:
            col = {"c": spec.name, "rev": max(store._meta[spec.name].revision, 1), "id_field": spec.id_field}
            if spec.kind == "doc":
                col["doc"] = store.doc(spec.name)
            else:
                col["records"] = store.all(spec.name)
            cols.append(col)
        records.replace(cols)
        print("Data uploaded.")
        mirror._known = {}
        n = mirror.sync()
        if mirror.last_error:
            print(f"Some files could not be uploaded: {mirror.last_error}. Run this again to retry.")
            return 1
        print(f"{n} files uploaded (photos, receipts, logo, backups).")
        print("Done. Open https://1gram.abharanamcollections.com/shop-admin and log in with your usual username.")
        print("If the online shop software was already open, restart it in Cloudflare (or wait for it to sleep).")
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    code = main(assume_yes="--yes" in sys.argv)
    if sys.stdin.isatty():
        input("Press Enter to close.")
    sys.exit(code)
