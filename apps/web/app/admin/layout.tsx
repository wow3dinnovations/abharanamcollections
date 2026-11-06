import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/enquiries", label: "Enquiries" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile();
  // Customers and visitors get a plain 404, so the admin area isn't advertised.
  if (!session?.isAdmin) notFound();
  return (
    <div className="grid gap-8 md:grid-cols-[180px_1fr]">
      <aside className="flex gap-1 overflow-x-auto md:flex-col">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded px-3 py-2 text-sm hover:bg-cream">
            {n.label}
          </Link>
        ))}
        <Link href="/shop-admin" className="shrink-0 rounded px-3 py-2 text-sm font-medium text-maroon hover:bg-cream">
          Shop software
        </Link>
        <p className="mt-4 hidden px-3 text-xs text-muted md:block">
          Add products, prices, stock, tags and bills in the shop software. They show here straight away.
        </p>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
