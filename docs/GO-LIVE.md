# Going live: 1gram.abharanamcollections.com

You already have from the WOW3D project: the **Cloudflare** account with `abharanamcollections.com` active,
**Resend** for login emails, an **Expo** account and the **Supabase** account. This store gets its **own
Supabase project** (Supabase's free plan allows two), so its products, customers and logins stay separate
from the 3D store.

| Address | What | Hosted on |
|---|---|---|
| 1gram.abharanamcollections.com | Website + admin (`apps/web`) | Cloudflare Workers (free to start) |
| Database, logins, photos | Supabase project `abharanam` (Mumbai) | Supabase (free to start) |
| Android app `com.abharanamcollections.app` | `apps/mobile` | Expo EAS → Google Play |
| 1gram.abharanamcollections.com/shop-admin | Shop software, **only for admins** (part of `apps/web`) | Same Worker and Supabase as the website (free) |

Do the steps in order. Each says what you should see when it worked.

## 1. Supabase project

1. https://supabase.com/dashboard → **New project**. Name `abharanam`, region **South Asia (Mumbai)**, strong
   database password (save it in your password manager).
2. Note three values:
   - **Project ref**: the 20-letter code in the address bar after `/project/`.
   - **Project URL**: `https://<project ref>.supabase.co`.
   - **anon / publishable key**: Project Settings → API Keys (anon public, starts `eyJ`, or Publishable, starts `sb_publishable_`).
     This one is safe for the website and app.
   - **service_role / Secret key**: same page. Not needed for the website or the online shop software. Never put
     it in the website, app or git.
3. Put the database in. In PowerShell, in the folder where you cloned this repo:
   ```powershell
   git pull
   npx supabase login
   npx supabase link --project-ref <your project ref>
   npx supabase db push
   ```
   You should see `20261102000001_init.sql`, `20261103000001_shop_cloud.sql` and `20261104000001_shop_online.sql` applied. **Don't run `seed.sql` on the live database**: it is sample data.
   Your real products come from the shop computer in step 3.
4. **Authentication → URL Configuration**: Site URL `https://1gram.abharanamcollections.com`, and add redirect URL
   `https://1gram.abharanamcollections.com/auth/callback**`.
5. Login emails with a 6-digit code: follow [EMAIL-LOGIN.md](EMAIL-LOGIN.md) (provider, templates, Gmail SMTP).

## 2. Website on Cloudflare

1. Cloudflare → **Workers & Pages** → **Create** → **Import a repository** → `wow3dinnovations/abharanamcollections`.
2. Settings (Worker name `abharanamcollections`, the same as `name` in `wrangler.jsonc`):
   - Root directory: leave empty
   - Build command: leave empty (or `pnpm --filter @abh/web cf:build`)
   - Deploy command: `npx wrangler deploy`
3. **Build variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon / publishable key
   - `NEXT_PUBLIC_SITE_URL` = `https://1gram.abharanamcollections.com`
   - `NODE_VERSION` = `22`
4. Deploy, open the `….workers.dev` link: the home page loads (empty until step 3).
5. Worker → **Settings → Domains & Routes → Add → Custom domain** → `1gram.abharanamcollections.com`.
6. Every push to `main` redeploys automatically.
7. Log in on the site with your email, then make yourself admin (SQL in the main README). In **Admin → Settings**
   fill in WhatsApp number (with 91), phone, email, address, Instagram.

## 3. Shop software online (1gram.abharanamcollections.com/shop-admin)

The shop software is part of the website, so it is **free** (no Workers Paid plan, no container). Only an
admin (step 2.7) can open it; customers and visitors get "page not found", and search engines are told to
skip it. Purchase rates, vendors, locations, stock per location and bills are in tables that only an admin
can read.

1. Put the shop tables in the database (PowerShell, in the repo folder):
   ```powershell
   git pull
   npx supabase db push
   ```
   You should see `20261104000001_shop_online.sql` applied.
2. Log in on the website, click **Admin → Shop software** (or open `/shop-admin`). You should see the
   dashboard.
3. Bring in the shop computer's data: **Import shop data**.
   - Data files: in `C:\1GRAM GOLD\Abharanam\data` choose `products.json`, `categories.json`,
     `subcategories.json`, `vendors.json` and `locations.json` together.
   - Photos: in `C:\1GRAM GOLD\Abharanam\uploads\products` select all photos (Ctrl+A). They are matched by
     file name (`IB21041.jpg` → product IB21041) and shrunk for the web.
   - Click **Import**. It is safe to run again: products are updated, not doubled, and the stock numbers from
     the files replace the stock online.
4. **Vendors & settings**: check the location and vendor names, the category codes, the price multiplier
   (selling price = purchase rate × multiplier) and the tag size (18 × 12 mm for the Udyama UDY 420B).
5. **Stop the shop computer publishing to the website**, so there is only one place where products are
   changed: in `C:\1GRAM GOLD\Abharanam\backend\.env` delete the lines starting with `WEBSITE_` and
   restart the shop software. From now on add products, print tags and make bills at `/shop-admin`.

What is where:

| Page | What you do there |
|---|---|
| Add product | Code is filled in automatically (next code for the same category + vendor + location); vendor, location and category stay selected; selling price = purchase rate × multiplier. **Save & add next** for the next piece. |
| Print tags | Tick products in **Products** (or scan codes), choose how many tags, **Print**. In the print window pick the tag printer, paper 18 × 12 mm, scale 100%, no margins. |
| Stock | Type the counted quantity per location and press Set. Every change is kept in the history. |
| Billing | Scan tags, add discount, **Save & print bill**. Stock goes down at that shop; cancelling a bill puts it back. |
| Bills | All bills by date, with totals. |

## 4. Android app

1. In PowerShell:
   ```powershell
   cd apps\mobile
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
   `init` adds the project id to `app.json`. Commit and push it (or send it to Claude).
2. Tell the app where the database is (repeat each with `--environment preview`):
   ```powershell
   npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://<project ref>.supabase.co
   npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key>
   npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SITE_URL --value https://1gram.abharanamcollections.com
   ```
3. Test build for any Android phone: `npx eas-cli@latest build --profile preview --platform android`, open the
   link it prints on the phone and install the APK.
4. Store build: `npx eas-cli@latest build --profile production --platform android` (gives an `.aab`).
5. Google Play Console: create the app "Abharanam – 1 Gram Gold", privacy policy
   `https://1gram.abharanamcollections.com/privacy`, account deletion URL `…/delete-account`, fill Data safety
   (name, phone, email collected for enquiries; not shared), upload the `.aab` to **Closed testing** first.
   New personal accounts need 12 testers for 14 days before production.

## 5. Landing page

The WOW3D repo's landing page (`apps/portal/1gram/`) still shows "coming soon". Change its **1GRAM GOLD**
button to `https://1gram.abharanamcollections.com` once the site is live.

## After launch

- Website changes: merge to `main`; Cloudflare redeploys.
- Shop software changes: they are part of the website, so the same Cloudflare redeploy updates them.
- Database changes: `npx supabase db push` after the migration is merged.
- App changes: new production build and upload (step 4.4–4.5).
