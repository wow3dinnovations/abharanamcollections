# How the software is built (simple version)

You do not need to read this to use the software. It is here so a future developer (or you) understands the design.

## The big picture

```
 Your browser  ──►  React screens (frontend/)  ──►  Python web server (backend/)  ──►  JSON files (data/)
   (Edge/Chrome)      what you see and click          rules, checks, calculations       your business data
```

* **Frontend** – React + Vite + TypeScript + Tailwind, charts by Recharts. Built once into `frontend/dist`, then served by the Python server, so you only start *one* thing.
* **Backend** – Python + FastAPI + Pydantic. It is the *only* thing that reads or writes your data.
* **Storage** – plain JSON files in `data/`. **No SQL database of any kind.**

## Folder map

```
backend/app/
  api/           the web addresses (one file per area: products, sales, reports…)
  core/          settings, security (passwords, login), permission list, friendly errors
  models/        the shape of each stored record (used to validate before saving)
  schemas/       the shape of requests coming from the screens
  services/      the business rules (sales, purchases, stock, expenses, reports…)
  repositories/  (reads go through the storage layer; kept for a future storage swap)
  storage/       THE ONLY code that touches the data files: json_store.py, backup.py
  utils/         money (rupees maths), dates
backend/tests/   automatic tests (108+)
frontend/src/    components, pages, layouts, hooks, services (API calls), types, utils
```

## The rules that never bend

1. **Only `backend/app/storage/` touches the data files.** Everything else asks it. To replace JSON with another storage later, only that folder changes.
2. **Every write is a transaction.** A sale changes six files; either all six are saved or none. See `local-storage.md`.
3. **Permissions are checked in the backend on every request**, not just by hiding buttons.
4. **Nothing financial is ever deleted.** Sales and expenses are *cancelled* (marked, with a reason, stock restored) and stay in the records.
5. **Stock only changes through one function** (`inventory_service.change_stock`), which always writes a history line (previous stock → new stock, who, when, why).
6. **Purchases ≠ Expenses.** Purchases become stock; expenses are running costs. Profit reports treat them differently.
7. **All money maths uses exact decimal/whole-paise arithmetic**, never floating-point guesses.

## A sale, step by step

```
Scan barcode → product looked up (server) → cart (screen)
Save Sale → POST /api/sales
   ├─ check: user may sell? discount allowed? enough stock at this location? payment adds up?
   ├─ prices come from the server (the screen cannot fake a price)
   └─ ONE TRANSACTION saves: sales.json, payments.json, products.json (stock, sold qty),
        inventory_transactions.json, customers.json (if new), audit_logs.json, counters.json
→ invoice PDF is generated → dashboard numbers change (calculated live from the files)
```

## Reports and Excel/PDF

Every report is produced as plain data (summary + tables + one chart). The screen draws it, and the Excel and PDF exporters turn *the same data* into files — so a downloaded file always matches the screen.

## Security summary

Passwords hashed with scrypt · login by secure cookie (HttpOnly, SameSite) · cross-site requests refused · 5 wrong passwords = 5 minute pause · uploads checked (type, size, real content) and stored under generated names · files are only served from fixed folders · Content-Security-Policy on the screens · developer API pages switched off · `SECRET_KEY` generated on first start and kept in `backend/.env` (never committed).

## Future expansion (designed for, not built)

Multiple stores/warehouses (locations already exist) · partial returns · supplier payments · loyalty · WhatsApp/SMS/email invoices · GST reports · cloud/PWA. See `deployment.md`.
