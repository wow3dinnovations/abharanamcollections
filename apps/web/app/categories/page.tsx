import type { Metadata } from "next";
import Link from "next/link";
import { ProductImage } from "@/components/ProductImage";
import { getCategories } from "@/lib/catalog";

export const metadata: Metadata = { title: "All categories" };

export default async function CategoriesPage() {
  const categories = await getCategories();
  return (
    <div>
      <h1 className="text-4xl font-semibold text-maroon">All categories</h1>
      <div className="gold-rule mb-6 mt-1 w-24" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((c) => (
          <Link key={c.id} href={`/shop?category=${c.slug}`} className="group overflow-hidden rounded-lg border border-cream bg-white">
            <div className="aspect-[4/3] overflow-hidden">
              <ProductImage path={c.image_path ?? c.cover_path} alt={c.name ?? ""} label={c.name} className="transition group-hover:scale-105" />
            </div>
            <div className="p-3">
              <p className="font-display text-xl font-semibold">{c.name}</p>
              <p className="text-xs text-muted">{c.product_count} designs</p>
              {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.description}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
