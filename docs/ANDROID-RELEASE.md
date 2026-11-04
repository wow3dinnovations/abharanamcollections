# Putting the Android app on Google Play

The app is in `apps/mobile` (Expo). It uses the same database as the website, so products, prices, stock and
photos you add in the shop software show in the app straight away. Expo's EAS service builds the app in the
cloud, so you don't need Android Studio.

You need: a Windows PC with Node 22 and this repo (the one you use for `npx supabase db push`), an Android
phone, and about 1 hour of work. After that, Google takes a few days to verify your account and up to
14 days of testing.

---

## Step 1. Create the Google Play developer account (do this first, it takes days)

1. Open https://play.google.com/console/signup and sign in with the Google account the shop will own.
2. Choose the account type:
   - **Organization** if Abharanam Collections is a registered business with a **D-U-N-S number** (free from
     https://www.dnb.com/duns-number/get-a-duns.html, takes a week or more). Organization accounts can publish
     straight after testing, with no 14-day rule.
   - **Yourself (personal)** otherwise. A new personal account must run a closed test with **at least 12
     testers for 14 days** before it can publish (see Step 7).
3. Pay the one-time **US$25** fee and complete identity verification (PAN/Aadhaar or business documents, and a
   phone number). Google says when it is done, usually in 1 to 7 days.

## Step 2. Link the app to Expo (5 minutes)

In PowerShell, in the repo folder:

```powershell
git pull
cd apps\mobile
npx eas-cli@latest login            # your Expo account
npx eas-cli@latest init             # answer Yes to create the project "abharanam-1gram"
```

`init` writes a project id into `apps\mobile\app.json`. Save it to GitHub:

```powershell
git add app.json
git commit -m "Link the app to Expo"
git push
```

## Step 3. Tell the app where the database is (5 minutes)

Use the same values as the website's Cloudflare variables (Supabase → Project Settings → API Keys). Run each
line once with `production` and once with `preview`:

```powershell
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_URL --value https://<project ref>.supabase.co
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon or publishable key>
npx eas-cli@latest env:create --environment production --visibility plaintext --name EXPO_PUBLIC_SITE_URL --value https://1gram.abharanamcollections.com
```

Use the **anon / publishable** key only. Never use the service_role / secret key here.

## Step 4. Test the app on your phone (about 20 minutes, mostly waiting)

```powershell
npx eas-cli@latest build --profile preview --platform android
```

When it asks **"Generate a new Android Keystore?"**, answer **Yes**. Expo keeps this signing key safe for you.
When the build finishes it prints a link and a QR code. Open it on your Android phone, download the APK and
install it (allow "install unknown apps" when the phone asks).

Check on the phone:
- the home page shows your categories and products with photos and prices;
- search and filters work, and a product page opens;
- add to wishlist and to the enquiry bag, then send an enquiry (it shows in Website admin → Enquiries);
- log in with your email and the 6-digit code, then open "My enquiries".

Take **4 to 8 screenshots** on the phone now (home, shop, a product, the bag). You need them in Step 6.

## Step 5. Make the Play Store build (about 20 minutes, mostly waiting)

```powershell
npx eas-cli@latest build --profile production --platform android
```

At the end, click the link it prints and **Download** the `.aab` file. This is what you upload to Google Play.
The version number goes up by itself on every production build.

Keep a backup of the signing key: `npx eas-cli@latest credentials` → Android → production →
"Download existing keystore", and store the file and passwords in your password manager.

## Step 6. Create the app in Play Console (about 45 minutes)

Play Console → **Create app**:
- App name: `Abharanam – 1 Gram Gold`
- Default language: English (India) – en-IN
- App, Free. Tick the two declarations.

Then on the **Dashboard**, finish each item under "Set up your app":

| Item | What to enter |
|---|---|
| Privacy policy | `https://1gram.abharanamcollections.com/privacy` |
| App access | "All or some functionality is restricted". Add instructions: *"Browsing and enquiries work without logging in. To log in, enter any email address on the Login screen; a 6-digit code is emailed to it."* |
| Ads | No, the app has no ads |
| Content rating | Fill the questionnaire: category "All other app types"; answer No to violence, sexual content, gambling, user chat and so on. Result: Everyone / 3+ |
| Target audience | 18 and over |
| News app | No |
| Data safety | See the table below |
| Government app | No |
| Financial features | "My app doesn't provide any financial features" |
| Health | No health features |
| Delete account URL | `https://1gram.abharanamcollections.com/delete-account` |

**Data safety answers:**
- Does your app collect or share user data? **Yes**. Is all data encrypted in transit? **Yes**.
  Can users ask for their data to be deleted? **Yes** (the delete-account URL above).
- Data collected (none of it is shared with other companies):
  - **Personal info → Name**: collected, for App functionality (enquiries) and Account management. Optional.
  - **Personal info → Email address**: collected, for Account management (login). Optional (only to log in).
  - **Personal info → Phone number**: collected, for App functionality (so the shop can call back). Optional.
  - **Personal info → Other info (city, message)**: collected, for App functionality. Optional.
- No location, photos, contacts, payment or device data.

**Store listing** (Grow → Store presence → Main store listing):
- Short description (max 80 characters):
  `1 gram gold jewellery: earrings, chains, bangles, bridal sets. Enquire easily.`
- Full description:

  > Discover Abharanam Collections' one gram gold jewellery on your phone. Browse earrings, jhumkas, chains,
  > long harams, chokers, bangles, bridal sets and more, with clear photos, prices and live stock from our shop.
  >
  > • New designs as soon as they arrive in the shop
  > • Search by name or design number, filter by category and price
  > • Save favourites to your wishlist
  > • Add pieces to your enquiry bag and send it to us in one tap, or chat on WhatsApp
  > • Log in with your email to see your enquiries
  >
  > One gram gold and imitation jewellery. Not solid gold.

- App icon: `app-icon-512.png`. Feature graphic: `feature-graphic-1024x500.png` (both are ready in the
  project files, folder `play-store`).
- Phone screenshots: the ones from Step 4.
- Category: **Shopping**. Contact email: your shop email. Website: `https://1gram.abharanamcollections.com`.

## Step 7. Test, then publish

**Personal account (12 testers for 14 days):**
1. Testing → **Closed testing** → Create track (or use "Alpha") → Testers: create an email list with at least
   **12 people** (family, staff, regular customers) using their Gmail addresses.
2. **Create new release** → upload the `.aab` from Step 5 → release notes "First version" → Save → Review →
   **Start rollout**.
3. Copy the "Join on the web" link from the Testers tab and send it to the testers. Each one opens it, taps
   **Become a tester**, then installs the app from Play Store. **They must stay opted in for 14 days**, and
   should open the app a few times.
4. After 14 days: Dashboard → **Apply for production**, answer the short questions about the test. Google
   replies in about 7 days.
5. When approved: Production → **Create new release** → "Add from library" (the same build) → **Start
   rollout to production**. Review takes 1 to 7 days, then the app is live on Google Play.

**Organization account:** Testing → **Internal testing** → upload the `.aab`, add yourself as a tester and
check it installs. Then Production → Create new release → add the same build → Start rollout.

When it is live, copy the Play Store link (`https://play.google.com/store/apps/details?id=com.abharanamcollections.app`)
and put it on the website and the landing page.

## Later: updating the app

Most changes need **no app update**: products, prices, stock, photos, categories and settings come from the
database, live.

For a new app version (new screens or fixes in `apps/mobile`):
1. Change `"version"` in `apps/mobile/app.json` (for example `1.0.1`) and push.
2. `npx eas-cli@latest build --profile production --platform android`.
3. Play Console → Production → Create new release → upload the new `.aab` → Start rollout.
