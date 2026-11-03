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
| 1gram.abharanamcollections.com/shop-admin | Shop software (`apps/shop-admin`), **only for you** | Cloudflare Container behind Cloudflare Access ($5/month Workers Paid plan) |

Do the steps in order. Each says what you should see when it worked.

## 1. Supabase project

1. https://supabase.com/dashboard → **New project**. Name `abharanam`, region **South Asia (Mumbai)**, strong
   database password (save it in your password manager).
2. Note three values:
   - **Project ref**: the 20-letter code in the address bar after `/project/`.
   - **Project URL**: `https://<project ref>.supabase.co`.
   - **anon / publishable key**: Project Settings → API Keys (anon public, starts `eyJ`, or Publishable, starts `sb_publishable_`).
     This one is safe for the website and app.
   - **service_role / Secret key**: same page. **Only** for the shop software (a Cloudflare secret in step 3, and
     `backend\.env` on the shop computer for the one-time upload). Never put it in the website, app or git.
3. Put the database in. In PowerShell, in the folder where you cloned this repo:
   ```powershell
   git pull
   npx supabase login
   npx supabase link --project-ref <your project ref>
   npx supabase db push
   ```
   You should see `20261102000001_init.sql` and `20261103000001_shop_cloud.sql` applied. **Don't run `seed.sql` on the live database**: it is sample data.
   Your real products come from the shop software in step 3.
4. **Authentication → URL Configuration**: Site URL `https://1gram.abharanamcollections.com`, and add redirect URL
   `https://1gram.abharanamcollections.com/auth/callback**`.
5. **Authentication → Emails → SMTP Settings**: same Resend settings as WOW3D (host `smtp.resend.com`, port `465`,
   user `resend`, password = your `re_…` key), sender `noreply@abharanamcollections.com`, name `Abharanam Collections`.
   Then **Templates**: for **Magic Link** and **Confirm signup** set the subject `Your Abharanam login link and code`
   and paste `supabase/templates/magic_link.html` as the body (the app needs the 6-digit code in it).

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

The shop software now runs on Cloudflare, so you can use it from any computer or phone. Customers never see it:
Cloudflare Access only lets your email address through (with a code sent to your email), and then the shop
software asks for its own username and password as before. Its data (products, stock, purchases, vendors,
sales, customers, expenses, photos, backups) is kept in the **private** part of your Supabase project, which
the website and app cannot read.

**3.1 Workers Paid plan.** Cloudflare → **Workers & Pages → Plans** → **Workers Paid** ($5/month). Containers
need it. The included usage covers a shop open all day; the software sleeps after 30 minutes without use and
wakes in a few seconds.

**3.2 Cloudflare Access (who may open it).**
1. Cloudflare → **Zero Trust** (left menu). First time: choose a team name, e.g. `abharanam`, and the **Free** plan.
   Your team domain is then `abharanam.cloudflareaccess.com`.
2. **Access → Applications → Add an application → Self-hosted**.
   - Name `Shop software`, session duration `1 week`.
   - Public hostname: subdomain `1gram`, domain `abharanamcollections.com`, path `shop-admin`.
   - Policy: name `Owner`, action **Allow**, include **Emails** → your email (add staff emails here later).
   - Login method: **One-time PIN**. Save.
3. Open the application again → **Overview**: copy the **Application Audience (AUD) Tag**.

**3.3 Let GitHub deploy it.**
1. Cloudflare → **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** → add two
   permissions: **Account › Containers › Edit** and **Account › Cloudchamber › Edit** → Account: yours,
   Zone: `abharanamcollections.com` → Create. Copy the token.
2. Your **Account ID**: Cloudflare home → your account → right side, **Account ID**.
3. GitHub → this repository → **Settings → Secrets and variables → Actions → New repository secret**:
   `CLOUDFLARE_API_TOKEN` = the token, `CLOUDFLARE_ACCOUNT_ID` = the account id.
4. GitHub → **Actions → Deploy shop software → Run workflow**. It takes about 5 minutes. After this, every push
   that changes the shop software redeploys it.

**3.4 Secrets for the shop software.** Cloudflare → **Workers & Pages → abharanam-shop-admin → Settings →
Variables and Secrets → Add** (type **Secret**) each of:

| Name | Value |
|---|---|
| `WEBSITE_SUPABASE_URL` | `https://<project ref>.supabase.co` |
| `WEBSITE_SUPABASE_SERVICE_KEY` | the service_role / Secret key |
| `ACCESS_TEAM_DOMAIN` | `abharanam.cloudflareaccess.com` (your team domain) |
| `ACCESS_AUD` | the AUD tag from 3.2 |

Until `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` are set, the page says "Not switched on yet" to everyone.

**3.5 Bring your existing data (once).** On the shop computer:
1. Close the shop software. Copy the new files from this repo's `apps/shop-admin` over your shop software folder
   (your `data`, `uploads` and `assets\logo` folders are not touched), then run `scripts\setup.bat` once.
2. Open `backend\.env` in Notepad and add:
   ```
   WEBSITE_SUPABASE_URL=https://<project ref>.supabase.co
   WEBSITE_SUPABASE_SERVICE_KEY=<service_role / Secret key>
   ```
3. Double-click `scripts\upload-to-cloud.bat`. It shows how many products, sales and customers it found, uploads
   them with all photos, the logo and backups, and says **Done**. Your local data is only read, not changed.

**3.6 Use it.**
1. Open `https://1gram.abharanamcollections.com/shop-admin` → enter your email → type the code from the email →
   log in with your usual shop software username and password.
2. **Administration → Website & App → Publish now**: you should see "Published … products". Open the website: all
   categories and products are there. While the shop software is open it publishes changes every 5 minutes.
3. From now on use **only the online one**. Don't keep working in the copy on the shop computer as well: the two
   don't merge. Keep the shop computer copy as it is, as a fallback.
4. Barcode tags: open the online page on the computer that has the label printer and print as before (the
   browser prints them, same as today).
5. Backups: the software still makes its own backup every 12 hours (the last 14 are kept online), and
   the **Export all data (zip)** button downloads everything as one file. Download one now and then and keep it safe.

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
- Shop software changes: merge to `main`; the **Deploy shop software** GitHub action redeploys it (it restarts,
  so finish any open bill first).
- Database changes: `npx supabase db push` after the migration is merged.
- App changes: new production build and upload (step 4.4–4.5).
