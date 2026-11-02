import type { Metadata } from "next";
import { getSettings } from "@/lib/catalog";
import { WishlistView } from "./WishlistView";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };

export default async function WishlistPage() {
  const settings = await getSettings();
  return (
    <div>
      <h1 className="text-4xl font-semibold text-maroon">Wishlist</h1>
      <div className="gold-rule mb-2 mt-1 w-24" />
      <p className="mb-6 text-sm text-muted">Saved on this device.</p>
      <WishlistView showPrice={settings?.show_prices ?? true} />
    </div>
  );
}
