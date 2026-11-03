import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Shop software", robots: { index: false, follow: false } };

const NAV = [
  { href: "/shop-admin", label: "Dashboard" },
  { href: "/shop-admin/products/new", label: "Add product" },
  { href: "/shop-admin/products", label: "Products" },
  { href: "/shop-admin/tags", label: "Print tags" },
  { href: "/shop-admin/stock", label: "Stock" },
  { href: "/shop-admin/pos", label: "Billing" },
  { href: "/shop-admin/sales", label: "Bills" },
  { href: "/shop-admin/setup", label: "Vendors & settings" },
  { href: "/shop-admin/import", label: "Import shop data" },
];

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();
  // Only the shop admin. Everyone else gets a plain 404, so the page isn't advertised.
  if (!session?.isAdmin) notFound();
  return (
    <div className="grid gap-6 md:grid-cols-[180px_1fr]">
      <aside className="flex gap-1 overflow-x-auto md:flex-col print:hidden">
        <p className="hidden px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-maroon md:block">Shop software</p>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded px-3 py-2 text-sm hover:bg-cream">
            {n.label}
          </Link>
        ))}
        <Link href="/admin" className="mt-2 shrink-0 rounded px-3 py-2 text-sm text-muted hover:bg-cream">
          Website admin
        </Link>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
