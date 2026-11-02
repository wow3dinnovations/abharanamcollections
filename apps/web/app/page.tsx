import Link from "next/link";
import { ProductGrid } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { getCategories, getHomeSections, getSettings } from "@/lib/catalog";

export default async function HomePage() {
  const [categories, { featured, latest }, settings] = await Promise.all([getCategories(), getHomeSections(), getSettings()]);
  const showPrice = settings?.show_prices ?? true;

  return (
    <div className="space-y-14">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-maroon via-maroon-dark to-ink px-6 py-14 text-center text-cream sm:py-20">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(circle_at_20%_20%,#e9d29a_0,transparent_35%),radial-gradient(circle_at_80%_70%,#b8892b_0,transparent_40%)]" />
        <p className="relative text-xs font-medium uppercase tracking-[0.35em] text-gold-light">1 Gram Gold Jewellery</p>
        <h1 className="relative mx-auto mt-3 max-w-2xl text-4xl font-semibold leading-tight text-white sm:text-6xl">
          {settings?.tagline || "Timeless Beauty, Precious You"}
        </h1>
        <p className="relative mx-auto mt-4 max-w-xl text-cream/85">
          The look of real gold for weddings, festivals and every day. New designs added every week.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="rounded-full bg-gold px-6 py-3 text-sm font-semibold text-white shadow hover:bg-gold/90">Shop all designs</Link>
          <Link href="/categories" className="rounded-full border border-gold-light/60 px-6 py-3 text-sm font-semibold text-gold-light hover:bg-white/10">Browse categories</Link>
        </div>
      </section>

      {categories.length > 0 && (
        <section>
          <SectionTitle title="Shop by category" href="/categories" />
          <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 lg:grid-cols-8">
            {categories.map((c) => (
              <Link key={c.id} href={`/shop?category=${c.slug}`} className="group flex w-24 shrink-0 flex-col items-center gap-2 text-center sm:w-auto">
                <span className="aspect-square w-full overflow-hidden rounded-full border-2 border-gold-light bg-white transition group-hover:border-gold">
                  <ProductImage path={c.image_path ?? c.cover_path} alt={c.name ?? ""} />
                </span>
                <span className="text-xs font-medium leading-tight">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {featured.length > 0 && (
        <section>
          <SectionTitle title="Bestsellers" href="/shop" />
          <ProductGrid items={featured} showPrice={showPrice} />
        </section>
      )}

      <section>
        <SectionTitle title="New arrivals" href="/shop" />
        {latest.length ? (
          <ProductGrid items={latest} showPrice={showPrice} />
        ) : (
          <p className="rounded-lg border border-cream bg-white p-8 text-center text-muted">New designs are on their way. Please check back soon.</p>
        )}
      </section>

      <section className="grid gap-4 rounded-2xl border border-cream bg-white p-6 text-center sm:grid-cols-4">
        {[
          ["Gold-like finish", "Micro gold plating that looks like the real thing"],
          ["Skin friendly", "Nickel-safe base metal, comfortable all day"],
          ["Enquire on WhatsApp", "Pick designs, send one message, we reply fast"],
          ["Shop or delivery", "Collect from our store or get it delivered"],
        ].map(([t, d]) => (
          <div key={t}>
            <p className="font-display text-xl font-semibold text-maroon">{t}</p>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-3xl font-semibold text-maroon">{title}</h2>
        <div className="gold-rule mt-1 w-24" />
      </div>
      {href && <Link href={href} className="text-sm font-medium text-gold hover:underline">View all</Link>}
    </div>
  );
}
