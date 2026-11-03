import type { Metadata } from "next";
import Link from "next/link";
import { sendLoginCode, verifyLoginCode } from "./actions";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

const input = "w-full rounded border border-cream bg-ivory px-3 py-2";
const button = "w-full rounded-full bg-maroon py-2.5 font-medium text-white hover:bg-maroon-dark";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ email?: string; error?: string; next?: string }> }) {
  const { email, error, next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm rounded-xl border border-cream bg-white p-6">
      <h1 className="text-3xl font-semibold text-maroon">Log in or sign up</h1>
      {!email ? (
        <>
          <p className="mt-1 text-sm text-muted">
            We email you a 6-digit code. No password. Logging in fills your details on enquiries and shows your past enquiries.
          </p>
          <form action={sendLoginCode} className="mt-6 space-y-3">
            <input type="hidden" name="next" value={next ?? ""} />
            <input name="email" type="email" required placeholder="you@example.com" autoComplete="email" aria-label="Email" className={input} />
            <button className={button}>Send code</button>
          </form>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            We sent a code to <b className="text-ink">{email}</b>. It can take a minute; check Spam too.
          </p>
          <form action={verifyLoginCode} className="mt-6 space-y-3">
            <input type="hidden" name="next" value={next ?? ""} />
            <input type="hidden" name="email" value={email} />
            <input
              name="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,10}"
              maxLength={10}
              placeholder="123456"
              aria-label="Code from the email"
              autoFocus
              className={`${input} text-center text-2xl tracking-[0.4em]`}
            />
            <button className={button}>Log in</button>
          </form>
          <div className="mt-4 flex justify-between text-sm">
            <form action={sendLoginCode}>
              <input type="hidden" name="next" value={next ?? ""} />
              <input type="hidden" name="email" value={email} />
              <button className="text-maroon underline">Send a new code</button>
            </form>
            <Link href={`/login?next=${encodeURIComponent(next ?? "")}`} className="text-muted underline">
              Use another email
            </Link>
          </div>
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
