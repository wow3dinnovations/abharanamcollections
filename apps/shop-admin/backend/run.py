"""Start ABHARANAM COLLECTIONS.   Usage:  python run.py   (the scripts/start.* files do this for you)"""
from __future__ import annotations

import sys
import threading
import time
import webbrowser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import uvicorn  # noqa: E402

from app.core.config import load_settings  # noqa: E402
from app.main import create_app  # noqa: E402


def main() -> None:
    settings = load_settings()
    url = f"http://localhost:{settings.port}"
    print("=" * 60)
    print("  ABHARANAM COLLECTIONS")
    print("  Timeless Beauty, Precious You")
    print("=" * 60)
    print(f"  Open this address in your browser:  {url}")
    print(f"  Your data is stored in:             {settings.data_dir}")
    print("  To stop the application press Ctrl+C or close this window.")
    print("=" * 60)
    if not settings.frontend_dist.exists():
        print("\n  NOTE: the screens have not been built yet. Run scripts/setup once first.\n")
    if "--no-browser" not in sys.argv:
        threading.Thread(target=lambda: (time.sleep(2.5), webbrowser.open(url)), daemon=True).start()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="warning")


if __name__ == "__main__":
    main()
