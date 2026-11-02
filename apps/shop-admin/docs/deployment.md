# Deployment

## Version 1: on one computer (what you have now)
The application listens on `127.0.0.1:8000`, so **only that computer** can open it. Data is in the project folder. This is the safest setup.

## Using it from other computers in the shop (LAN)
1. Give the main computer a fixed IP on the shop network.
2. In `backend/.env` set `HOST=0.0.0.0` and restart.
3. Allow the app through Windows Firewall (private networks only).
4. Other computers open `http://<main computer IP>:8000`.
The data still lives on the main computer only. **Only one copy of the application may run** (it locks the data folder). Use a strong Admin password; do not expose it to the internet this way.

## Running online later (server)
Not needed now — noted for the future:
* Use a small Windows/Linux server. Install Python and Node, follow the README set-up, copy your `data` and `uploads`.
* **HTTPS is mandatory** online: put it behind a reverse proxy (Caddy, nginx, IIS) with a certificate, and set `COOKIE_SECURE=1` in `backend/.env` so the login cookie is only sent over HTTPS.
* Keep `HOST=127.0.0.1` and let only the proxy reach it.
* Run it as a service (Windows: NSSM/Task Scheduler; Linux: systemd) using `python backend/run.py --no-browser`.
* Set a long, secret `SECRET_KEY` (it is generated automatically on first start).
* Keep **off-site backups** of `data/` and `uploads/` (nightly copy to cloud storage of *your* choice).
* Scale: JSON files suit one shop and one running copy. For many simultaneous users or several stores writing at once, the storage layer (`backend/app/storage/`) would need replacing — a decision for you, never made silently.

## Updating the software
Close the app → **Backup Now** → replace the code → `bash scripts/setup.sh` → start. Your `data` folder is untouched; new settings appear automatically with defaults.

## Environment settings (`backend/.env`)
| Setting | Meaning | Default |
|---|---|---|
| `SECRET_KEY` | signs logins (auto-generated) | – |
| `HOST`, `PORT` | where it listens | `127.0.0.1`, `8000` |
| `SESSION_HOURS` | how long a login lasts | 12 |
| `AUTO_BACKUP_HOURS`, `AUTO_BACKUP_KEEP` | automatic backups | 12, 30 |
| `COOKIE_SECURE` | `1` when using HTTPS | off |
| `ABH_BASE_DIR` | store data elsewhere | project folder |
| `ABH_DEBUG` | `1` shows developer API pages | off |

Never put business data or share this file. It is excluded from git.
