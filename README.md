# Abharanam Collections · 1 Gram Gold

Customer website, Android app and shop software for **Abharanam Collections**, a one gram gold jewellery shop.

| Part | What it does | Tech | Where |
|---|---|---|---|
| **Website** – 1gram.abharanamcollections.com | Customers browse every category, search and filter, see photos, prices and stock, keep a wishlist and send an enquiry (or WhatsApp). Admin pages for enquiries, product visibility, bestsellers, extra photos, categories and settings. | Next.js on Cloudflare Workers | `apps/web` (admin at `/admin`) |
| **Android app** (iPhone later) | Same catalog as the website: home, shop with filters, product page, wishlist, enquiry bag, login with emailed code, my enquiries. | Expo (React Native) | `apps/mobile` |
| **Shop software** | Online at `1gram.abharanamcollections.com/shop-admin`, only for admins: add products (automatic codes, vendor and location stay selected, price = rate × multiplier), print barcode tags (Udyama UDY 420B, 18×12 mm), stock per location, billing and bills, vendors and locations, import from the shop computer. Products show on the website and app straight away. | Next.js pages in `apps/web/app/shop-admin` + Supabase tables `shop_*` (admin-only) | `apps/web` |
| **Shop computer software** (older) | The Windows version: also purchases, expenses, reports and backups. Its data can be imported online. | Python (FastAPI) + React, JSON records | `apps/shop-admin` |
| Online database, logins, photos | | Supabase (Postgres) | `supabase/` |
| Shared logic (₹ formatting, filters, enquiry bag, WhatsApp message) | | TypeScript | `packages/core` |

## How the pieces fit

```
 Shop computer                          Internet
 ┌─────────────────────────┐   publish  ┌──────────────┐     ┌────────────────────────────┐
 │ Shop software           │ ─────────► │  Supabase    │ ◄── │ Website 1gram.abharanam…   │
 │ products, tags, stock,  │  (every 5  │  catalog,    │     │ Android app                │
 │ POS bills, purchases…   │   minutes) │  enquiries   │ ──► │ customers send enquiries   │
 └─────────────────────────┘            └──────────────┘     └────────────────────────────┘
```

* The shop software stays the **master copy**. Add products and print tags there as you do today; sell in the POS.
  Stock goes down on the website automatically on the next publish.
* Only safe fields leave the shop: name, SKU, selling price, description, collection, material, colour, size,
  tags, total stock and the photo. **Purchase rates, vendors, locations, sales, customers and expenses are never
  readable by the website or app**: they live in the private `shop_private` schema and `shop-files` bucket, reachable
  only with the service key that only the shop software has.
* Customers don't pay online. They send an **enquiry** (saved in the website admin) and can also send it on WhatsApp.
  You confirm availability, delivery and payment with them, then bill it in the POS.

## Run it on your laptop

You need **Docker Desktop** (running), **Node 22** and **pnpm** (`corepack enable`). For the shop software also **Python 3.11+**.

```bash
pnpm install
pnpm db:start                 # local Postgres, login and photo storage in Docker + sample jewellery data
pnpm --filter @abh/web dev    # website on http://127.0.0.1:3000
```

* Supabase Studio (tables, SQL): http://127.0.0.1:54323 · Test inbox for login emails: http://127.0.0.1:54324
* Phone app: see [apps/mobile/README.md](apps/mobile/README.md)
* Shop software: see [apps/shop-admin/README.md](apps/shop-admin/README.md). To publish to the local website, put
  `WEBSITE_SUPABASE_URL=http://127.0.0.1:54321` and the local `SERVICE_ROLE_KEY` from `npx supabase status -o env` in `apps/shop-admin/backend/.env`.

## Make yourself admin on the website

1. Open the website → account icon → enter your email → open the link from the email.
2. Supabase **SQL editor**:
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Refresh. An **Admin** button appears in the header.

## Tests

```bash
pnpm test                 # shared logic (prices, filters, enquiry bag, WhatsApp text)
pnpm typecheck            # website, app and packages
npx supabase test db      # database security: hidden products, enquiries, prices, admin-only access
cd apps/shop-admin/backend && python -m pytest -q   # shop software (165 tests, incl. website publishing; online-mode tests need SHOP_CLOUD_TEST_URL/KEY)
```

## Going live

Test everything on your PC first: [docs/LOCAL-TESTING.md](docs/LOCAL-TESTING.md). Then step by step (Supabase project, Cloudflare, connecting the shop software, Android build): [docs/GO-LIVE.md](docs/GO-LIVE.md).

## Changing the database

```bash
npx supabase migration new <name>   # write SQL in the new file
pnpm db:reset                       # re-apply all migrations + sample data
pnpm db:types                       # regenerate packages/db types
```
