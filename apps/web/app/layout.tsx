import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { HeaderCounts } from "@/components/HeaderCounts";
import { Logo } from "@/components/Logo";
import { SearchBox } from "@/components/SearchBox";
import { getCategories, getSettings } from "@/lib/catalog";
import { SITE_URL } from "@/lib/storage";
import { getSessionProfile } from "@/lib/supabase/server";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Abharanam Collections | 1 Gram Gold Jewellery", template: "%s | Abharanam 1 Gram Gold" },
  description:
    "One gram gold jewellery: earrings, chains, chokers, bangles, long harams, bridal sets and more. Browse the latest designs and enquire on WhatsApp.",
  openGraph: { siteName: "Abharanam Collections", type: "website", locale: "en_IN" },
};

export const viewport: Viewport = { themeColor: "#6b1d2a" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [session, settings, categories] = await Promise.all([getSessionProfile(), getSettings(), getCategories()]);
  const year = new Date().getFullYear();

  return (
    <html lang="en-IN">
      <body className="flex min-h-screen flex-col">
        {settings?.announcement && (
          <p className="bg-maroon px-4 py-1.5 text-center text-xs tracking-wide text-gold-light">{settings.announcement}</p>
        )}
        <header className="sticky top-0 z-20 border-b border-cream bg-ivory/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
            <Logo name={settings?.store_name} />
            <SearchBox className="ml-4 hidden flex-1 md:flex" />
            <nav className="ml-auto flex items-center gap-4 text-sm md:ml-0">
              <Link href="/shop" className="hidden hover:text-maroon sm:inline">Shop</Link>
              <Link href="/categories" className="hidden hover:text-maroon sm:inline">Categories</Link>
              {session?.isAdmin && (
                <Link href="/admin" className="rounded bg-ink px-2.5 py-1 text-xs font-medium text-white">Admin</Link>
              )}
              <Link href={session ? "/account" : "/login"} className="p-1" aria-label={session ? "My account" : "Log in"}>
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                </svg>
              </Link>
              <HeaderCounts />
            </nav>
          </div>
          <div className="mx-auto max-w-6xl px-4 pb-3 md:hidden">
            <SearchBox />
          </div>
          <nav aria-label="Categories" className="no-scrollbar mx-auto flex max-w-6xl gap-5 overflow-x-auto px-4 pb-2 text-xs font-medium uppercase tracking-wider text-muted">
            {categories.map((c) => (
              <Link key={c.id} href={`/shop?category=${c.slug}`} className="shrink-0 py-1 hover:text-maroon">
                {c.name}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>

        <footer className="mt-12 bg-maroon-dark text-sm text-cream">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
            <div>
              <p className="font-display text-2xl font-bold text-gold-light">{settings?.store_name ?? "Abharanam Collections"}</p>
              <p className="mt-1 italic text-cream/80">{settings?.tagline}</p>
              {settings?.address && <p className="mt-3 text-cream/80">{settings.address}</p>}
            </div>
            <div>
              <p className="mb-2 font-semibold uppercase tracking-wider text-gold-light">Shop</p>
              <ul className="space-y-1">
                {categories.slice(0, 8).map((c) => (
                  <li key={c.id}><Link href={`/shop?category=${c.slug}`} className="hover:underline">{c.name}</Link></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 font-semibold uppercase tracking-wider text-gold-light">Help</p>
              <ul className="space-y-1">
                <li><Link href="/how-to-order" className="hover:underline">How to order</Link></li>
                <li><Link href="/care" className="hover:underline">Jewellery care</Link></li>
                <li><Link href="/faq" className="hover:underline">FAQ</Link></li>
                <li><Link href="/contact" className="hover:underline">Contact us</Link></li>
                <li><Link href="/about" className="hover:underline">About us</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-2 font-semibold uppercase tracking-wider text-gold-light">Policies</p>
              <ul className="space-y-1">
                <li><Link href="/shipping-policy" className="hover:underline">Shipping</Link></li>
                <li><Link href="/returns" className="hover:underline">Returns & exchange</Link></li>
                <li><Link href="/privacy" className="hover:underline">Privacy policy</Link></li>
                <li><Link href="/terms" className="hover:underline">Terms</Link></li>
                <li><Link href="/delete-account" className="hover:underline">Delete your account</Link></li>
              </ul>
            </div>
          </div>
          <p className="border-t border-white/10 py-4 text-center text-xs text-cream/60">
            © {year} {settings?.store_name ?? "Abharanam Collections"}. One gram gold and imitation jewellery. Not solid gold.
          </p>
        </footer>
      </body>
    </html>
  );
}
