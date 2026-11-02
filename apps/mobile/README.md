# Abharanam mobile app (Android, iPhone later)

One Expo (React Native) codebase. Customers browse every category, search and filter (price, in stock, sort),
open a product (photos, price, stock, WhatsApp, share), keep a wishlist, and send an enquiry bag. Login is
optional (emailed 6-digit code) and shows "My enquiries". Admin stays on the website.

Screens are in `src/app` (Expo Router: every file is a screen). Shared rules come from `@abh/core`, so the app
and website calculate totals and WhatsApp messages the same way.

## Try it on your phone (Expo Go)

1. Install **Expo Go**. Phone and laptop on the same Wi-Fi.
2. `pnpm db:start` in the repo root.
3. `copy apps\mobile\.env.example apps\mobile\.env.local` and set `EXPO_PUBLIC_SUPABASE_URL=http://<laptop IP>:54321`,
   the `ANON_KEY` from `npx supabase status -o env`, and `EXPO_PUBLIC_SITE_URL=http://<laptop IP>:3000`.
   (Run `ipconfig` for the IP. `127.0.0.1` would mean the phone itself.)
4. `pnpm --filter @abh/mobile start` and scan the QR code with Expo Go.

In a laptop browser instead: `pnpm --filter @abh/mobile web`.

## Checks

```bash
pnpm --filter @abh/mobile typecheck
pnpm --filter @abh/mobile exec expo export --platform android   # proves the Android app bundles
```

Building the installable app and publishing to Google Play: [docs/GO-LIVE.md](../../docs/GO-LIVE.md#4-android-app).
