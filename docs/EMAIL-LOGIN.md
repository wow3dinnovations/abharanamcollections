# Login with a code sent by email

Customers (and you, for the website's Admin) log in by typing their email, then the **6-digit code** that
arrives by email. No password. The Android app works the same way. All settings below are in the Supabase
dashboard of the `abharanam` project.

## 1. Email provider

**Authentication → Sign In / Providers → Email**
- **Enable Email provider**: on
- **Confirm email**: on
- **Email OTP Expiration**: `3600` (one hour)
- **Email OTP Length**: `6`
- Save.

## 2. Website address

**Authentication → URL Configuration**
- **Site URL**: `https://1gram.abharanamcollections.com`
- **Redirect URLs → Add URL**: `https://1gram.abharanamcollections.com/**`
  (while testing also `https://abharanamcollections.wow3dinnovations.workers.dev/**`)

## 3. Email text with the code

**Authentication → Emails → Templates**. Do this for **Magic link** and again for **Confirm signup**
(new customers get "Confirm signup" the first time):
- **Subject**: `Your Abharanam login code`
- **Body**: delete what is there and paste the whole file `supabase/templates/magic_link.html` from this
  repository. It must contain `{{ .Token }}`: that is where the code appears.
- Save.

## 4. Send the emails through your Gmail (reliable, free)

Supabase's own mailer only sends ~2 emails an hour and only to members of your Supabase team, so customers
never get a code. Use your shop's Gmail account instead (up to ~500 emails a day).

**a. Make a Gmail app password**
1. Sign in to the shop's Gmail account → https://myaccount.google.com/security → turn on **2-Step Verification**.
2. Open https://myaccount.google.com/apppasswords → name it `Supabase` → **Create**.
3. Copy the 16-letter password (Google shows it once). Remove the spaces.

**b. Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP**

| Field | Value |
|---|---|
| Sender email address | the same Gmail address, e.g. `yourshop@gmail.com` |
| Sender name | `Abharanam Collections` |
| Host | `smtp.gmail.com` |
| Port number | `465` |
| Minimum interval between emails | `60` |
| Username | the same Gmail address |
| Password | the 16-letter app password (not your normal Gmail password) |

Save. The sender address must be the Gmail address itself, or Gmail refuses or rewrites it.

**c. Authentication → Rate Limits → Rate limit for sending emails**: set `30` per hour and save.

> Error `535 ... credentials` means the username or password is wrong: username = full Gmail address,
> password = the app password. With Resend instead of Gmail: username is literally `resend`, password is the
> `re_...` API key, host `smtp.resend.com`, port `465`, and the sender's domain must show **Verified** in Resend.

## 5. Test

1. Open `https://1gram.abharanamcollections.com/login`, type your email, press **Send code**.
2. The email "Your Abharanam login code" arrives within a minute (check Spam the first time and mark it
   "Not spam").
3. Type the 6 digits → **Log in**. You land on **My account**.

If no email arrives: Supabase → **Logs → Auth** shows the reason (for example a wrong SMTP password).
To make yourself admin after the first login, see the SQL in the main README.
