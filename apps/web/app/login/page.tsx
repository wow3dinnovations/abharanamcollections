import type { Metadata } from "next";
import { sendLoginLink } from "./actions";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; next?: string }> }) {
  const { sent, error, next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm rounded-xl border border-cream bg-white p-6">
      <h1 className="text-3xl font-semibold text-maroon">Log in or sign up</h1>
      <p className="mt-1 text-sm text-muted">
        Optional: logging in fills your details on enquiries and shows your past enquiries. We email you a one-time link, no password.
      </p>
      {sent ? (
        <p className="mt-6 rounded bg-green-50 p-3 text-sm text-green-800">Check your email for the login link.</p>
      ) : (
        <form action={sendLoginLink} className="mt-6 space-y-3">
          <input type="hidden" name="next" value={next ?? ""} />
          <input name="email" type="email" required placeholder="you@example.com" autoComplete="email" aria-label="Email" className="w-full rounded border border-cream bg-ivory px-3 py-2" />
          <button className="w-full rounded-full bg-maroon py-2.5 font-medium text-white hover:bg-maroon-dark">Send login link</button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
