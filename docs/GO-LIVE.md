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
| Shop software | `apps/shop-admin` | the shop computer, as today |

Do the steps in order. Each says what you should see when it worked.

## 1. Supabase project

1. https://supabase.com/dashboard → **New project**. Name `abharanam`, region **South Asia (Mumbai)**, strong
   database password (save it in your password manager).
2. Note three values:
   - **Project ref**: the 20-letter code in the address bar after `/project/`.
   - **Project URL**: `https://<project ref>.supabase.co`.
   - **anon / publishable key**: Project Settings → API Keys (anon public, starts `eyJ`, or Publishable, starts `sb_publishable_`).
     This one is safe for the website and app.
   - **service_role / Secret key**: same page. **Only** for the shop software on the shop computer. Never put it in the website, app or git.
3. Put the database in. In PowerShell, in the folder where you cloned this repo:
   ```powershell
   git pull
   npx supabase login
   npx supabase link --project-ref <your project ref>
   npx supabase db push
   ```
   You should see `20261102000001_init.sql` applied. **Don't run `seed.sql` on the live database**: it is sample data.
   Your real products come from the shop software in step 3.
4. **Authentication → URL Configuration**: Site URL `https://1gram.abharanamcollections.com`, and add redirect URL
   `https://1gram.abharanamcollections.com/auth/callback**`.
5. **Authentication → Emails → SMTP Settings**: same Resend settings as WOW3D (host `smtp.resend.com`, port `465`,
   user `resend`, password = your `re_…` key), sender `noreply@abharanamcollections.com`, name `Abharanam Collections`.
   Then **Templates**: for **Magic Link** and **Confirm signup** set the subject `Your Abharanam login link and code`
   and paste `supabase/templates/magic_link.html` as the body (the app needs the 6-digit code in it).

## 2. Website on Cloudflare

1. Cloudflare → **Workers & Pages** → **Create** → **Import a repository** → `wow3dinnovations/abharanamcollections`.
2. Settings:
   - Project name: `abharanam-1gram` (must match `apps/web/wrangler.jsonc`)
   - Root directory: leave empty
   - Build command: `pnpm install --frozen-lockfile && pnpm --filter @abh/web cf:build`
   - Deploy command: `cd apps/web && npx wrangler deploy`
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

## 3. Connect the shop software

On the shop computer, in the shop software folder:

1. Close the application. Copy the new files from `apps/shop-admin` of this repo over your shop software
   folder (or use this repo's `apps/shop-admin` folder as your shop software from now on and copy your `data`,
   `uploads` and `assets\logo` folders into it). Your `data` folder is never touched by the copy.
2. Run `scripts\setup.bat` once (rebuilds the screens with the new **Website & App** page).
3. Open `backend\.env` in Notepad and add:
   ```
   WEBSITE_SUPABASE_URL=https://<project ref>.supabase.co
   WEBSITE_SUPABASE_SERVICE_KEY=<service_role / Secret key>
   WEBSITE_SYNC_MINUTES=5
   ```
4. Start the application → **Administration → Website & App** → **Publish now**. You should see
   "Published 204 products". Open the website: all categories and products are there.
5. From now on changes are published every 5 minutes while the shop software is open.
   Add photos on each product's Edit page; they appear on the website after the next publish.

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
- Database changes: `npx supabase db push` after the migration is merged.
- App changes: new production build and upload (step 4.4–4.5).
