# Test everything on your Windows PC (before going live)

This runs the **website, its admin, the Android app and the shop software** on your own computer, with a
private test database. Nothing goes on the internet and your real shop software and data are not changed.

Takes about 30–45 minutes the first time. Type every command in **PowerShell** unless it says otherwise.

---

## 0. Install once

| Need | Get it | Check (PowerShell) |
|---|---|---|
| Git | https://git-scm.com/download/win | `git --version` |
| Node.js **22** LTS | https://nodejs.org (choose 22.x LTS) | `node --version` → v22… |
| pnpm | `corepack enable` (in an **admin** PowerShell) | `pnpm --version` |
| Docker Desktop | https://www.docker.com/products/docker-desktop | Docker Desktop is open and says *Engine running* |
| Python 3.11+ | you already have it for the shop software | `python --version` |

Docker on Windows needs virtualization (Task Manager → Performance → CPU → *Virtualization: Enabled*) and WSL 2
(`wsl --install` in an admin PowerShell, then restart). If you set up WOW3D locally before, this is already done.

## 1. Get the code

```powershell
mkdir C:\Code -ErrorAction SilentlyContinue
cd C:\Code
git clone https://github.com/wow3dinnovations/abharanamcollections.git
cd abharanamcollections
pnpm install
```

Later, to get my newest changes: `cd C:\Code\abharanamcollections` then `git pull` and `pnpm install`.

## 2. Start the test database

Docker Desktop must be running.

```powershell
pnpm db:start
```

The first time it downloads a few GB (5–15 min). At the end it prints a table. Keep these for later:

```powershell
npx supabase status -o env
```

You need `ANON_KEY` (for the app) and `SERVICE_ROLE_KEY` (for the shop software).

The test database comes with **sample jewellery** (16 categories, 64 pieces) so you can try things straight away.
Useful pages:

* **Supabase Studio** (see and edit tables, run SQL): http://127.0.0.1:54323
* **Mailpit** (all login emails land here, nothing is really sent): http://127.0.0.1:54324

## 3. Website

Open a **second** PowerShell window:

```powershell
cd C:\Code\abharanamcollections
pnpm --filter @abh/web dev
```

Open **http://127.0.0.1:3000**. Try:

- [ ] Home page, categories bar, *Shop by category*
- [ ] Shop: search "lakshmi", pick a category, price band, *In stock only*, sort by price
- [ ] A product: add to wishlist (heart), *Add to enquiry bag*, *Share*, *Ask on WhatsApp*
- [ ] Wishlist page and the bag: change quantities, remove a piece
- [ ] Send an enquiry with any name and a 10-digit mobile. You see *Thank you!* and an ENQ number
- [ ] Footer pages: How to order, Care, FAQ, Shipping, Returns, Privacy, Terms, Contact
- [ ] On your phone's browser: run `ipconfig`, note the IPv4 address (e.g. 192.168.1.20), stop the website
  (Ctrl+C) and start it with `pnpm --filter @abh/web dev -H 0.0.0.0`, then open `http://192.168.1.20:3000` on the phone
  (same Wi-Fi). Photos only load on the laptop in this mode, which is fine for checking the layout.

## 4. Website admin

1. On the website click the **person icon** → enter any email (e.g. `you@test.com`) → *Send login link*.
2. Open **Mailpit** http://127.0.0.1:54324 → open the email → click **Log in**.
3. Make yourself admin: **Studio** http://127.0.0.1:54323 → **SQL Editor** → paste and **Run**:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@test.com');
   ```
4. Refresh the website. An **Admin** button appears at the top.

Try:

- [ ] **Enquiries**: open the one you sent, change status to *Contacted*, add a note, *WhatsApp customer*
- [ ] **Products**: hide one (it disappears from the shop), mark one *Featured* (appears under *Bestsellers* on Home),
  open one and set an MRP (crossed-out price and "% off"), add extra photos
- [ ] **Categories**: change the order, add a cover photo, hide a category
- [ ] **Settings**: your WhatsApp number (with 91, e.g. 919876543210), phone, address, announcement bar,
  *Show prices* on/off, *Accept enquiries* on/off
- [ ] **My account** (person icon): name, mobile, city; the enquiries you sent while logged in

## 5. Shop software with your real products (on a copy)

This uses a **copy** of your data, so your real shop software in `C:\1GRAM GOLD\Abharanam` is not touched.

1. Remove the sample jewellery so your own categories get clean names: Studio → SQL Editor → paste the contents
   of `supabase\clear-sample-data.sql` → **Run**.
2. Copy your data into the new shop software folder (PowerShell):
   ```powershell
   $new = "C:\Code\abharanamcollections\apps\shop-admin"
   robocopy "C:\1GRAM GOLD\Abharanam\data"    "$new\data"    /E
   robocopy "C:\1GRAM GOLD\Abharanam\uploads" "$new\uploads" /E
   ```
3. Set it up once: double-click `C:\Code\abharanamcollections\apps\shop-admin\scripts\setup.bat`
   (or in Git Bash: `bash scripts/setup.sh` inside that folder).
4. Create `C:\Code\abharanamcollections\apps\shop-admin\backend\.env` in Notepad with (paste the
   `SERVICE_ROLE_KEY` from step 2):
   ```
   PORT=8001
   WEBSITE_SUPABASE_URL=http://127.0.0.1:54321
   WEBSITE_SUPABASE_SERVICE_KEY=paste-SERVICE_ROLE_KEY-here
   WEBSITE_SYNC_MINUTES=1
   WEBSITE_PUBLIC_URL=http://127.0.0.1:3000
   ```
   `PORT=8001` lets it run next to your real shop software (which uses 8000).
5. Start it: double-click `apps\shop-admin\scripts\start.bat`, open **http://localhost:8001** and log in with
   your usual username and password (it's a copy of your data).
6. **Administration → Website & App → Publish now**. You should see "Published 204 products".

Try:

- [ ] Website now shows your real categories and products (gold placeholders where there's no photo)
- [ ] In the shop software, edit a product: add a photo, change the price → *Publish now* (or wait 1 minute) →
  refresh the product on the website
- [ ] Sell a piece in **POS** until its stock is 0 → after the next publish it shows **Sold out**
- [ ] Set a product to *Inactive* → it disappears from the website
- [ ] Add a new product and print its tag as usual → it appears on the website
- [ ] Staff without the *Publish to Website* permission don't see the page

## 6. Android app on your phone

1. Install **Expo Go** from the Play Store. Phone and laptop on the **same Wi-Fi**.
2. Find the laptop IP: `ipconfig` → *IPv4 Address* (e.g. 192.168.1.20).
3. Create `C:\Code\abharanamcollections\apps\mobile\.env.local` in Notepad:
   ```
   EXPO_PUBLIC_SUPABASE_URL=http://192.168.1.20:54321
   EXPO_PUBLIC_SUPABASE_ANON_KEY=paste-ANON_KEY-here
   EXPO_PUBLIC_SITE_URL=http://192.168.1.20:3000
   ```
4. Third PowerShell window:
   ```powershell
   cd C:\Code\abharanamcollections
   pnpm --filter @abh/mobile start
   ```
5. Scan the QR code with Expo Go. If Windows Firewall asks, allow **Node.js** and **Docker** on *Private networks*.

Try:

- [ ] Home, Shop (category chips, price, in stock, sort, search, *Load more*)
- [ ] Product: swipe photos, wishlist, add to bag, Share, WhatsApp
- [ ] Bag: quantities, send an enquiry → it appears in the website **Admin → Enquiries** marked *app*
- [ ] Account → Log in with email → get the 6-digit code from **Mailpit** on the laptop → My enquiries

No phone handy? `pnpm --filter @abh/mobile web` shows the app in the laptop browser (use 127.0.0.1 in `.env.local`).

## 7. Stop and start again

* Stop: Ctrl+C in each PowerShell window, then `pnpm db:stop`. Your test data is kept.
* Start again next time: `pnpm db:start`, then steps 3 / 5.5 / 6.4.
* Start the test database fresh (sample data back, test enquiries gone): `pnpm db:reset`. In the shop software
  copy, press *Re-publish everything* afterwards.

## 8. Asking for changes

Write what you want changed in the project chat, with a screenshot if it helps (e.g. "make the product photo bigger
on phones", "add a Bridal collection banner on the home page"). After I push, run `git pull` and `pnpm install`,
and restart the window that's running the part that changed.

## Common problems

| Problem | Fix |
|---|---|
| `pnpm db:start` says Docker isn't running | Open Docker Desktop and wait for *Engine running* |
| Port 54321/54322 already in use | The WOW3D test database is running: `cd C:\3D\Code\wow3d` then `pnpm db:stop` |
| Website shows *Your project's URL and Key are required* | Use `pnpm --filter @abh/web dev` (not `build`/`start`) |
| Login email never arrives | It's in Mailpit http://127.0.0.1:54324, not your real inbox |
| App on phone can't load anything | `.env.local` must use the laptop IP, not 127.0.0.1; same Wi-Fi; allow Docker/Node in the firewall; restart `pnpm --filter @abh/mobile start` after editing `.env.local` |
| Shop software *Publish now* says the key was refused | Paste `SERVICE_ROLE_KEY` (not ANON_KEY) in `backend\.env` and restart it |
| Categories show as "earrings-2" on the website | Sample data was still there: run `supabase\clear-sample-data.sql`, then *Re-publish everything* |

When you later connect the shop software to the **live** website, it automatically sends everything again (it
remembers which website it last published to).
