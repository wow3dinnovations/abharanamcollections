# Online orders and payment

Customers can now add pieces to the bag, check out with a delivery address and pay. This works on the website
and in the Android app (the app opens the website's secure payment page, then comes back).

Payment options, each with its own switch in **Admin → Settings → Online orders and payment**:

| Option | What happens | Needs |
|---|---|---|
| **Pay online with Razorpay** | UPI apps, cards, netbanking. The order is marked paid automatically. | A Razorpay account and 4 secrets (below) |
| **UPI to our account** | After ordering, the customer pays your UPI ID. You check the payment and mark it paid in Admin → Orders. | Your UPI ID |
| **Cash on delivery** | Paid when the parcel arrives. | Nothing |

How it is kept safe:
- Prices, delivery charge and stock are worked out by the database, never taken from the customer's browser.
- An order is marked paid only after Razorpay's signature is checked on the server. Customers cannot mark
  their own orders paid.
- Stock is taken when the order is placed (from the shop locations with the most pieces first) and goes back
  if the order is cancelled. Razorpay orders that are not paid within 60 minutes are released automatically.
- Your notes on an order are private: the customer never sees them.

---

## Step 1. Update the database (2 minutes)

PowerShell, in the repo folder:

```powershell
git pull
npx supabase db push
```

You should see `20261106000001_orders.sql` applied. Wait for the website to redeploy (Cloudflare does this by
itself after the push, about 3 minutes).

## Step 2. Switch on Cash on delivery and UPI (2 minutes)

Website → **Admin → Settings → Online orders and payment**:
1. Tick **Take online orders**.
2. Tick **Cash on delivery** and/or **UPI to our account**. For UPI, enter your UPI ID (for example `abharanam@okaxis`).
3. Set the **delivery charge** (for example 80) and **free delivery on orders from** (for example 1999; 0 means never free).
4. Save. The bag now shows **Buy now**. Place a test order yourself and check it in **Admin → Orders**.

You can stop here and add Razorpay later.

## Step 3. Razorpay account (1 to 3 days for approval)

1. Sign up at https://dashboard.razorpay.com/signup with the shop's email and mobile number.
2. Complete **KYC / account activation**: business type, PAN, bank account for payouts, and the website
   `https://1gram.abharanamcollections.com`. Razorpay checks that the site has these pages, which are ready:
   - Terms: `/terms`
   - Privacy policy: `/privacy`
   - Shipping policy: `/shipping-policy`
   - Returns and refunds: `/returns`
   - Contact us: `/contact`
3. Razorpay charges about 2% per payment (UPI is often lower). Money reaches your bank account in about 2 working
   days.

## Step 4. Test with Razorpay test keys first (15 minutes)

You can do this before KYC is approved.

1. Razorpay dashboard → switch to **Test mode** (top) → **Account & Settings → API keys → Generate key**. Copy
   the **Key ID** (`rzp_test_…`) and **Key secret**.
2. **Account & Settings → Webhooks → Add new webhook**:
   - Webhook URL: `https://1gram.abharanamcollections.com/api/razorpay/webhook`
   - Secret: make up a long password (20+ letters and numbers) and save it in your password manager.
   - Active events: tick **payment.captured** and **order.paid**.
3. Supabase → Project Settings → API Keys → copy the **service_role / Secret key**.
4. Cloudflare → Workers & Pages → `abharanamcollections` → **Settings → Variables and Secrets → Add**. Add each
   one with type **Secret** (not under build variables):

   | Name | Value |
   |---|---|
   | `RAZORPAY_KEY_ID` | Key ID from 1 |
   | `RAZORPAY_KEY_SECRET` | Key secret from 1 |
   | `RAZORPAY_WEBHOOK_SECRET` | the webhook secret you made up in 2 |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role / Secret key from 3 |

   Click **Deploy** when Cloudflare asks. These stay on the server only. Never put them in the app, in
   GitHub, or in a build variable.
5. Website → Admin → Settings → tick **Pay online with Razorpay** → Save. (If the keys are missing, the settings
   page says so.)
6. Test: add a piece to the bag → **Buy now** → choose **Pay online (UPI, cards, netbanking)** → **Place order & pay**. On the
   Razorpay window choose UPI and enter `success@razorpay`, or a test card from
   https://razorpay.com/docs/payments/payments/test-card-details/. The page should say **"We received your
   payment"**, and in Admin → Orders the order shows **Paid**.

## Step 5. Go live with real payments (5 minutes)

When Razorpay says your account is activated:
1. Razorpay dashboard → switch to **Live mode** → API keys → **Generate key**, and add the webhook again in
   Live mode (same URL, events and a new secret).
2. Cloudflare → Variables and Secrets: replace `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and
   `RAZORPAY_WEBHOOK_SECRET` with the live values → Deploy.
3. Place one small real order (for example a ₹10 test product, or a real piece) and refund it from the
   Razorpay dashboard to confirm money flows.

## Step 6. Android app update

The app's new screens (Buy now, checkout, My orders) need a new app build:
1. Change `"version"` in `apps/mobile/app.json` to `1.1.0` and push.
2. `npx eas-cli@latest build --profile production --platform android`
3. Play Console → your testing track or Production → **Create new release** → upload the new `.aab`.

In Play Console → **App content → Data safety**, update: **Personal info → Address** collected (App
functionality, to deliver orders), and **Financial info → Purchase history** collected (App functionality).
Card and UPI details are handled by Razorpay on its own page; the app does not collect them.

---

## Running orders day to day

**Admin → Orders** lists every order with filters: New, To pack & ship, Shipped, Delivered, Payment pending,
Cancelled. Open an order to:
- see the pieces, the address and a WhatsApp button for the customer;
- change the status (Confirmed → Packed → Shipped → Delivered) and add the courier tracking number, which the
  customer sees on their order page;
- mark a UPI or cash-on-delivery order **Paid**;
- cancel an order: the pieces go back into stock. For a paid Razorpay order, refund it in the Razorpay
  dashboard (Payments → the payment → Refund) and set the payment to **Refunded** here.

Customers see their orders in **Account → My orders** (website and app), and can cancel an unpaid order themselves
until you confirm it.
