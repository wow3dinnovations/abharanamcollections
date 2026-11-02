# Where and how your data is stored

## The files (`data/` folder)

Each topic is one file. You may open them in Notepad to look, but **do not edit them while the application runs**.

| File | What it holds |
|---|---|
| `users.json` | Logins (passwords are stored **hashed**, never as text) |
| `roles.json`, `permissions.json` | Ready-made permission sets and the list of permissions |
| `categories.json`, `subcategories.json` | Product categories |
| `vendors.json`, `locations.json` | Sellers you buy from, places you keep stock |
| `products.json` | Every product with its stock per location |
| `purchases.json` | Stock you bought |
| `inventory_transactions.json` | **Every** stock movement (the stock history) |
| `stock_transfers.json` | Moves between locations |
| `customers.json` | Customers |
| `sales.json`, `payments.json` | Bills and money received |
| `expenses.json`, `expense_categories.json` | Business expenses |
| `barcode_print_jobs.json` | Label print history |
| `audit_logs.json` | Who did what, when |
| `settings.json` | Business details and options |
| `counters.json` | Next number for invoices, products, etc. |

Pictures and receipts are **not** inside these files: they are in `uploads/`, and the files only remember the path (e.g. `uploads/products/ABH-JHM-000123.jpg`).

## What a file looks like

```json
{ "schema_version": 1, "revision": 42, "updated_at": "2026-09-19T11:50:49", "records": [ { "id": "PRD-000001", ... } ] }
```
`revision` goes up by one on every save — handy to see that a file changed.

## How saving stays safe

1. The change is prepared **in memory** and **validated** (types, ranges, no negative stock…).
2. Every changed file is written to a **temporary file**, flushed to the disk, then **read back and compared** byte-for-byte.
3. A tiny **journal** is written, and the **previous version of each file is kept** during the swap.
4. The temporary files replace the real ones (an *atomic* swap).
5. The journal and the old copies are removed.

If anything fails (or the power goes out) at any step, the previous complete state is restored — automatically on the next start. You will see a notice: *"The app stopped in the middle of saving… your data was returned to the last complete state."*

Only one copy of the application may use the data folder (a lock file prevents two at once).

## Damaged or missing files

* **Missing file:** re-created empty, and shown as a warning in **Data Health**.
* **Damaged file (not valid JSON):** clearly flagged — *"products.json appears to be corrupted. Please restore a backup."* The file is **never overwritten**. The rest of the application keeps working.
* **Administration → Data Health** also checks duplicate SKUs/barcodes, broken links (a sale pointing at a product that no longer exists), wrong quantities and prices, and that **stock equals the total of its stock history**.
* If a numbering counter ever falls behind the data (e.g. after a hand edit), it is repaired automatically on start.

## Speed and size

Everything is loaded into memory when the application starts, so searching and scanning are instant. Measured with **10,000 products, 100,000 stock movements and 30,000 bills (120,000 bill lines)**:

| Action | Time |
|---|---|
| Application start | ~1 second |
| Scan a barcode | ~10 ms |
| Search products | ~40 ms |
| Save a bill | ~0.75 s (well under 0.2 s for a normal shop size) |
| Dashboard | ~0.8 s |
| Data Health check | ~1.4 s |
| Excel export of 30,000 bills | ~13 s |

**Honest limitation:** each save rewrites the changed files. At *very* large sizes (hundreds of thousands of bills) saving slows down further. That is the natural limit of a file-based store. If you ever reach it, the design lets `backend/app/storage/` be replaced — **but no SQL will ever be introduced without your explicit approval.**

## Copying / backing up by hand

Close the application, then copy the whole `data` folder (and `uploads`). That is a complete copy. Restoring = putting those folders back. See `backup-restore.md`.
