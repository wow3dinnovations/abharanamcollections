import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { ShopMobileMenu, ShopNav } from "@/components/shop/ShopNav";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shop software", robots: { index: false, follow: false } };

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();
  // Only the shop admin. Everyone else gets a plain 404, so the page isn't advertised.
  if (!session?.isAdmin) notFound();
  const supabase = await createClient();
  const { count: pending } = await supabase.from("shop_returns").select("id", { count: "exact", head: true }).eq("status", "pending");
  const name = session.profile?.full_name?.trim() || "Admin";

  return (
    // The shop software fills the whole screen (over the website's header and footer).
    <div className="shop-shell fixed inset-0 z-40 flex bg-ivory text-ink print:static print:block">
      <style>{`@media print { body > header, body > footer, body > p { display: none !important; } body > main { padding: 0 !important; max-width: none !important; } }`}</style>
      <aside className="hidden w-60 shrink-0 flex-col bg-maroon-dark text-cream md:flex print:hidden">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={40} height={40} className="h-10 w-10 rounded-full ring-1 ring-gold/60" />
          <div className="leading-tight">
            <p className="font-display text-lg font-bold uppercase tracking-wider text-gold-light">Abharanam</p>
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-gold-light">Collections</p>
            <p className="text-[9px] italic text-cream/70">Timeless Beauty, Precious You</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <ShopNav pending={pending ?? 0} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col print:block">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-cream bg-white/70 px-4 print:hidden">
          <ShopMobileMenu pending={pending ?? 0} />
          <p className="hidden text-sm text-muted sm:block">
            Welcome back, <b className="text-ink">{name}</b>
          </p>
          <span className="flex-1" />
          <span className="rounded-full bg-gold-light/60 px-2.5 py-0.5 text-xs font-medium text-maroon-dark">Admin</span>
          <Link href="/" className="text-sm font-medium hover:text-maroon">Website</Link>
          <form action={signOut}>
            <button className="rounded-md border border-cream bg-white px-3 py-1 text-sm font-medium hover:bg-cream">Log out</button>
          </form>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 md:px-8 print:overflow-visible print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
