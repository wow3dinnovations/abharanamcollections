"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductCard } from "@/components/ProductCard";
import type { CardItem } from "@/lib/catalog";
import { useWishlist } from "@/lib/local";
import { createClient } from "@/lib/supabase/browser";

const COLS = "id, sku, name, slug, category_name, category_slug, price, mrp, in_stock, stock_qty, image_paths, is_featured, collection";

export function WishlistView({ showPrice }: { showPrice: boolean }) {
  const ids = useWishlist();
  const [items, setItems] = useState<CardItem[] | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    if (!key) {
      setItems([]);
      return;
    }
    createClient()
      .from("catalog")
      .select(COLS)
      .in("id", key.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)))
      .then(({ data }) => setItems((data ?? []) as CardItem[]));
  }, [key]);

  if (items === null) return <p className="text-muted">Loading…</p>;
  const shown = ids.map((id) => items.find((p) => p.id === id)).filter((p): p is CardItem => !!p);
  if (!shown.length) {
    return (
      <div className="rounded-xl border border-cream bg-white p-10 text-center">
        <p className="font-display text-2xl text-maroon">No favourites yet</p>
        <p className="mt-1 text-sm text-muted">Tap the heart on any design to save it here.</p>
        <Link href="/shop" className="mt-4 inline-block rounded-full bg-maroon px-5 py-2 text-sm text-white">Browse designs</Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {shown.map((p) => (
        <ProductCard key={p.id} p={p} showPrice={showPrice} />
      ))}
    </div>
  );
}
