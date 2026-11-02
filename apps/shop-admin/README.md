# ABHARANAM COLLECTIONS
### *Timeless Beauty, Precious You*

Business management software for an imitation / one-gram gold jewellery shop.
It runs **on your own computer**, opens in your web browser, and keeps **all business data in plain files on your computer**.

* **No database to install.** No SQL, no server software, no cloud.
* Products, stock, purchases, barcode labels, billing (POS), invoices, expenses, reports, Excel import/export, staff permissions, audit trail and backups.

> Written for someone who is **not** a programmer. Every step says *where* to type it (**Git Bash**, **CMD** or **PowerShell**).

---

## Contents
1. What you need (Python, Node.js)
2. One-time set-up
3. Starting the application every day
4. First time: create your Admin login
5. Where your data lives
6. Backup and restore
7. Excel: export and import
8. Barcode labels, printer and scanner
9. Staff and permissions
10. Adding expenses
11. Moving to another computer
12. Troubleshooting
13. More guides (`docs/` folder)

---

## 1. What you need

| Need | Where to get it | How to check (Git Bash) |
|---|---|---|
| **Python 3.11 or newer** | python.org → Downloads. Tick **"Add Python to PATH"** when installing. | `python --version` |
| **Node.js (LTS)** | nodejs.org → LTS version | `node --version` |
| A browser | Microsoft Edge or Chrome (already on Windows) | – |

Both are needed **only for set-up**. Day to day you just start the application.

## 2. One-time set-up

Open **Git Bash** in the project folder (right-click the folder → *Open Git Bash here*) and run:

```bash
bash scripts/setup.sh
```

This creates the Python environment (`backend/.venv`), installs everything, and builds the screens. It takes a few minutes the first time and needs internet **only** for this step.

*(Prefer double-clicking? Use `scripts\setup.bat` instead.)*

<details><summary>What the script does, step by step (for the curious)</summary>

1. **Create the Python virtual environment** – `python -m venv backend/.venv`
2. **Activate it** – Git Bash: `source backend/.venv/Scripts/activate` · CMD: `backend\.venv\Scripts\activate` · PowerShell: `backend\.venv\Scripts\Activate.ps1`
3. **Install Python requirements** – `pip install -r backend/requirements.txt`
4. **Install frontend packages** – `cd frontend && npm install`
5. **Build the screens** – `npm run build`
</details>

## 3. Starting the application every day

**Git Bash:**
```bash
bash scripts/start.sh
```
or **double-click** `scripts\start.bat`.

A black window opens and your browser goes to **http://localhost:8000**. **Keep the black window open** while you work. To stop the application, close that window (or press `Ctrl+C`).

> Tip: put a shortcut to `scripts\start.bat` on your desktop.

*For developers:* `bash scripts/dev.sh` starts the backend on port 8000 and the live screen server on **http://localhost:5173**.

## 4. First time: create your Admin login

The first time you open the application it shows **"Welcome — create your Admin account"**. Choose your own username and password. **There is no built-in password** and none is ever stored in plain text.

*Forgot the password?* Close the application, then in Git Bash: `bash scripts/reset_password.sh`.

Next, in this order (each takes a minute):
1. **Purchases → Locations** – add where your stock is (e.g. *Nandyal*).
2. **Purchases → Vendors** – add who you buy from.
3. **Administration → Categories** – add Earrings, Jhumkas, Chains… (each needs a short *code* like `EAR`).
4. **Administration → Settings** – business address, phone, logo, label size.
5. **Inventory → Add Product** – your first product.

Want to explore first? **Administration → Export Data** (bottom of the page) → **Load demo data**. Demo records are marked and can be removed with one click before real business starts.

**Your logo** is in `assets/logo/logo.png` and already appears on the login page, the menu and every invoice. To change it, replace that file or use *Settings → Business → Upload logo*.

## 5. Where your data lives

```
data/            ← ALL your business data (one plain .json file per topic)
uploads/products ← product pictures
uploads/expenses ← expense receipts
invoices/        ← a PDF copy of every invoice
exports/         ← copies of every Excel/PDF file you download
backups/         ← timestamped backups
barcode_labels/  ← reserved for label files
logs/            ← technical log (for troubleshooting)
assets/logo/     ← your logo
```

You can open any `.json` file in Notepad to *see* your data. **Do not edit them by hand** while the application is running. More in `docs/local-storage.md`.

## 6. Backup and restore

* **Automatic:** a backup is made when the application starts (if the last one is older than 12 hours) and then every 12 hours. The newest 30 automatic backups are kept.
* **Manual:** **Administration → Backup & Restore → Backup Now**.
* **Restore:** same page → **View / Restore** on a backup. You see the date, the files inside, and must type **RESTORE**. A safety copy of your *current* data is made first, so a restore can itself be undone.
* Copy the `backups` folder to a pen drive regularly — a backup on the same computer does not help if the computer fails.

## 7. Excel: export and import

* **Every report** has **Export Excel** and **Export PDF** buttons (formatted, with filters, totals and ₹ formatting).
* **Administration → Export Data** – download Products, Sales, Purchases, Expenses, Customers, Vendors, Audit log, Inventory history as Excel.
* **Import products:** **Administration → Import Products** → *Download template* → fill it → upload → match columns → *Check my file* → *Import*. Nothing is saved unless **every** row is correct; you get an Excel error report otherwise.

## 8. Barcode labels, printer and scanner

* **Your printer:** Udyama POS **UDY 420B**, USB, tag **12 × 18 mm** — already set as the default.
* **Print labels:** *Barcode → Print Labels* → search product → number of labels → **Print**. In the browser print window choose the UDY 420B, **Margins: None**, **Scale: 100%**.
* **Barcode on small tags is a short number** (e.g. `100123`) because a long SKU cannot be printed in 18 mm. The SKU is still the product code, and the POS finds products by either.
* **One-time calibration (5 minutes):** *Barcode → Printer Test* → print the test tags → scan each → press **Use this width** on the thinnest one that scans every time.
* **Scanner:** it works like a keyboard. In *POS / New Bill* the big **SCAN BARCODE** box is always ready — scan a tag and the product is added. Scan again to add one more.
* Details, sizes and troubleshooting: `docs/barcode-printing.md`.

## 9. Staff and permissions

**Administration → Staff → Add staff.** Choose a ready-made set (Cashier, Inventory Manager, Shop Manager) or tick exactly what the person may do. Untick *Give Discount* and staff cannot discount; you can also set each person's maximum discount %. The rules are enforced inside the software, not only by hiding buttons. See `docs/user-guide.md`.

## 10. Adding expenses

**Expenses → Add Expense.** Choose the category (Shop Rent, Packaging, Marketing…), amount, who you paid, how you paid, attach the bill photo/PDF, **Save**. Today's and this month's expenses appear on the Dashboard immediately.

> **Purchases vs Expenses:** jewellery bought *to sell* is a **Purchase** (it becomes stock). Rent, bags, marketing, a printer… are **Expenses**. They are never mixed.

## 11. Moving to another computer

1. Close the application. 2. **Administration → Backup & Restore → Backup Now** (or *Export Data → Export all data (zip)*). 3. Copy the **`data`** and **`uploads`** folders (and `assets/logo`). 4. On the new computer follow *One-time set-up*. 5. Paste the folders into the project folder. 6. Start the application. Nothing else is needed — there is no database to move.

## 12. Troubleshooting (short)

| Problem | What to do |
|---|---|
| "Another copy … is already using this data folder" | The application is already running. Close the other black window. |
| Browser shows "can't reach this page" | The black window is closed. Start the application again. |
| Port 8000 already used | Edit `backend/.env`, set `PORT=8001`, restart, open `http://localhost:8001`. |
| "products.json appears to be corrupted" | **Administration → Backup & Restore →** restore the newest backup. Details in `docs/troubleshooting.md`. |
| Forgot the password | `bash scripts/reset_password.sh` (application closed). |
| Labels print in the wrong place / barcode will not scan | Run *Barcode → Printer Test* and see `docs/barcode-printing.md`. |

Full list: `docs/troubleshooting.md`.

## 13. More guides

`docs/user-guide.md` · `docs/inventory.md` · `docs/billing.md` · `docs/expenses.md` · `docs/barcode-printing.md` · `docs/backup-restore.md` · `docs/local-storage.md` · `docs/architecture.md` · `docs/deployment.md` · `docs/troubleshooting.md`

---

## 14. Website & App (1gram.abharanamcollections.com)

**Administration → Website & App** publishes your catalog to the customer website and Android app.

* What is sent: categories, product name, SKU, selling price, description, collection, material, colour, size, tags, **total stock** (all locations added up) and the product photo.
* What is **never** sent: purchase rate, vendors, locations, sales, bills, customers, expenses, staff.
* Connect it once: add to `backend/.env`
  ```
  WEBSITE_SUPABASE_URL=https://xxxx.supabase.co
  WEBSITE_SUPABASE_SERVICE_KEY=the service_role / Secret key (keep it secret)
  WEBSITE_SYNC_MINUTES=5
  ```
  then restart. Changes are published every 5 minutes while the application is open, or press **Publish now**.
* Inactive / deleted products disappear from the website; sold-out pieces show "Sold out".
* Staff need the **Publish to Website** permission to use the page.
* Customers send enquiries on the website/app. You see them in the website's **Admin → Enquiries**; when they buy, bill them in the POS as usual.

## 15. Online (1gram.abharanamcollections.com/shop-admin)

The same software also runs online, so it can be used from anywhere. Setup is in the repository's
`docs/GO-LIVE.md`, step 3. How it works:

* `cloud/` is a small Cloudflare Worker on `1gram.abharanamcollections.com/shop-admin*`. It lets only people
  allowed by **Cloudflare Access** through, then passes the request to the software running in one
  **Cloudflare Container** (built from `Dockerfile`). The container sleeps after 30 minutes without use.
* With `SHOP_CLOUD=1` the data files are kept in Supabase (`backend/app/storage/cloud.py`): loaded at start-up,
  and every save goes to Supabase first, all or nothing. Photos, receipts, logo and backups are kept in the
  private `shop-files` bucket. The application itself works exactly as on the shop computer.
* `scripts\upload-to-cloud.bat` copies the shop computer's data online once.

---

*For developers:* FastAPI (Python) + React/Vite/TypeScript/Tailwind. Tests: `bash scripts/run_tests.sh`. The application stores JSON records only (no SQL queries); online, Supabase just keeps those records.
