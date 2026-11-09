"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export const SHOP_NAV: { title: string; items: { href: string; label: string }[] }[] = [
  { title: "", items: [{ href: "/shop-admin", label: "Dashboard" }] },
  {
    title: "Inventory",
    items: [
      { href: "/shop-admin/products", label: "Products" },
      { href: "/shop-admin/products/new", label: "Add product" },
      { href: "/shop-admin/stock", label: "Stock" },
      { href: "/shop-admin/tags", label: "Print tags" },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/shop-admin/pos", label: "New bill" },
      { href: "/shop-admin/sales", label: "Bills" },
      { href: "/shop-admin/sales/daily", label: "Daily sales" },
      { href: "/shop-admin/sales/monthly", label: "Monthly sales" },
      { href: "/shop-admin/returns", label: "Returns / cancellations" },
    ],
  },
  { title: "Expenses", items: [{ href: "/shop-admin/expenses", label: "Shop expenses" }] },
  {
    title: "Reports",
    items: [
      { href: "/shop-admin/reports", label: "Profit & loss" },
      { href: "/shop-admin/vendors", label: "Vendor performance" },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/shop-admin/setup", label: "Vendors & settings" },
      { href: "/shop-admin/import", label: "Import shop data" },
      { href: "/admin", label: "Website admin" },
    ],
  },
];

const ALL = SHOP_NAV.flatMap((g) => g.items.map((i) => i.href));

/** The link that best matches the page (longest prefix), so /shop-admin/products/new lights "Add product" only. */
function activeHref(path: string) {
  return ALL.filter((h) => path === h || (h !== "/shop-admin" && path.startsWith(h + "/"))).sort((a, b) => b.length - a.length)[0] ?? "";
}

export function ShopNav({ pending = 0, onNavigate }: { pending?: number; onNavigate?: () => void }) {
  const active = activeHref(usePathname());
  return (
    <nav className="space-y-4 text-sm">
      {SHOP_NAV.map((g) => (
        <div key={g.title || "home"}>
          {g.title && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold-light/70">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  onClick={onNavigate}
                  className={`flex items-center justify-between rounded-md px-3 py-1.5 ${
                    active === i.href ? "bg-white/15 font-medium text-white" : "text-cream/85 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {i.label}
                  {i.href === "/shop-admin/returns" && pending > 0 && (
                    <span className="rounded-full bg-gold px-1.5 text-[10px] font-semibold text-maroon-dark">{pending}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phones: the same menu behind a button. */
export function ShopMobileMenu({ pending = 0 }: { pending?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-md border border-cream bg-white px-3 py-1.5 text-sm font-medium"
      >
        {open ? "Close" : "Menu"}
      </button>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-50 overflow-y-auto bg-maroon-dark p-4">
          <ShopNav pending={pending} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
