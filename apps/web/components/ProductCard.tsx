import Link from "next/link";
import type { CardItem } from "@/lib/catalog";
import { Price } from "./Price";
import { ProductImage } from "./ProductImage";
import { WishButton } from "./WishButton";

export function ProductCard({ p, showPrice = true }: { p: CardItem; showPrice?: boolean }) {
  return (
    <Link href={`/products/${p.slug}`} className="group flex flex-col overflow-hidden rounded-lg border border-cream bg-white transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square overflow-hidden">
        <ProductImage path={p.image_paths?.[0]} alt={p.name} label={p.category_name} className="transition duration-300 group-hover:scale-105" />
        <WishButton id={p.id} className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 shadow-sm" />
        {!p.in_stock && (
          <span className="absolute left-2 top-2 rounded bg-ink/80 px-2 py-0.5 text-xs font-medium text-white">Sold out</span>
        )}
        {p.in_stock && p.is_featured && (
          <span className="absolute left-2 top-2 rounded bg-gold px-2 py-0.5 text-xs font-medium text-white">Bestseller</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</p>
        <p className="text-xs text-muted">Design {p.sku}</p>
        <div className="mt-auto pt-1">{showPrice ? <Price price={p.price} mrp={p.mrp} /> : <span className="text-sm text-maroon">Ask for price</span>}</div>
      </div>
    </Link>
  );
}

export function ProductGrid({ items, showPrice = true }: { items: CardItem[]; showPrice?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <ProductCard key={p.id} p={p} showPrice={showPrice} />
      ))}
    </div>
  );
}
