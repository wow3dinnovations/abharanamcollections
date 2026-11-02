import { filtersToParams, parseFilters, PRICE_BANDS, SORTS, type ShopFilters } from "@abh/core";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { ProductGrid } from "@/components/ProductCard";
import { getCategories, getFacets, getSettings, listProducts } from "@/lib/catalog";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const cats = await getCategories();
  const cat = cats.find((c) => c.slug === f.category);
  if (f.q) return { title: `Search: ${f.q}` };
  if (cat) return { title: `${cat.name} – 1 gram gold`, description: cat.description || undefined };
  return { title: "Shop all 1 gram gold jewellery" };
}

function href(f: ShopFilters, change: Partial<ShopFilters>) {
  const params = new URLSearchParams(filtersToParams({ ...f, page: 1, ...change }));
  const s = params.toString();
  return s ? `/shop?${s}` : "/shop";
}

export default async function ShopPage({ searchParams }: Props) {
  const f = parseFilters(await searchParams);
  const [categories, facets, result, settings] = await Promise.all([
    getCategories(),
    getFacets(f.category),
    listProducts(f),
    getSettings(),
  ]);
  const cat = categories.find((c) => c.slug === f.category);
  const title = f.q ? `Results for “${f.q}”` : cat?.name ?? "All jewellery";
  const activeChips: [string, Partial<ShopFilters>][] = [];
  if (f.q) activeChips.push([`“${f.q}”`, { q: undefined }]);
  if (cat) activeChips.push([cat.name ?? "", { category: undefined, type: undefined }]);
  if (f.type) activeChips.push([facets.types.find((t) => t.slug === f.type)?.name ?? f.type, { type: undefined }]);
  if (f.collection) activeChips.push([f.collection, { collection: undefined }]);
  if (f.colour) activeChips.push([f.colour, { colour: undefined }]);
  if (f.price) activeChips.push([PRICE_BANDS.find((b) => b.key === f.price)!.label, { price: undefined }]);
  if (f.inStock) activeChips.push(["In stock", { inStock: false }]);

  return (
    <div>
      <nav className="mb-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:underline">Home</Link> / <Link href="/shop" className="hover:underline">Shop</Link>
        {cat && <> / {cat.name}</>}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-4xl font-semibold text-maroon">{title}</h1>
          <div className="gold-rule mt-1 w-24" />
        </div>
        <p className="text-sm text-muted">{result.total} {result.total === 1 ? "design" : "designs"}</p>
      </div>
      {cat?.description && !f.q && <p className="mt-2 max-w-2xl text-sm text-muted">{cat.description}</p>}

      <AutoSubmitForm action="/shop" className="mt-5 grid grid-cols-2 gap-2 rounded-lg border border-cream bg-white p-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {f.q && <input type="hidden" name="q" value={f.q} />}
        <Select name="category" label="Category" value={f.category} options={categories.map((c) => [c.slug ?? "", c.name ?? ""])} all="All categories" />
        {facets.types.length > 0 && (
          <Select name="type" label="Type" value={f.type} options={facets.types.map((t) => [t.slug, t.name])} all="All types" />
        )}
        <Select name="price" label="Price" value={f.price} options={PRICE_BANDS.map((b) => [b.key, b.label])} all="Any price" />
        {facets.collections.length > 0 && (
          <Select name="collection" label="Collection" value={f.collection} options={facets.collections.map((c) => [c, c])} all="All collections" />
        )}
        {facets.colours.length > 0 && (
          <Select name="colour" label="Colour / stones" value={f.colour} options={facets.colours.map((c) => [c, c])} all="Any colour" />
        )}
        <Select name="sort" label="Sort by" value={f.sort} options={Object.entries(SORTS)} />
        <label className="col-span-2 flex items-center gap-2 self-end py-2 sm:col-span-1">
          <input type="checkbox" name="instock" value="1" defaultChecked={f.inStock} className="h-4 w-4 accent-maroon" />
          In stock only
        </label>
        <noscript>
          <button className="rounded bg-maroon px-3 py-2 text-white">Apply</button>
        </noscript>
      </AutoSubmitForm>

      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeChips.map(([label, change]) => (
            <Link key={label} href={href(f, change)} className="rounded-full border border-gold-light bg-cream px-3 py-1 text-xs hover:bg-gold-light">
              {label} ✕
            </Link>
          ))}
          <Link href="/shop" className="px-2 py-1 text-xs text-maroon underline">Clear all</Link>
        </div>
      )}

      <div className="mt-6">
        {result.items.length ? (
          <ProductGrid items={result.items} showPrice={settings?.show_prices ?? true} />
        ) : (
          <div className="rounded-lg border border-cream bg-white p-10 text-center">
            <p className="font-display text-2xl text-maroon">No designs match</p>
            <p className="mt-1 text-sm text-muted">Try fewer filters, or WhatsApp us a photo of what you&apos;re looking for.</p>
            <Link href="/shop" className="mt-4 inline-block rounded-full bg-maroon px-5 py-2 text-sm text-white">See all designs</Link>
          </div>
        )}
      </div>

      {result.pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2 text-sm" aria-label="Pages">
          {result.page > 1 && <Link className="rounded border border-cream bg-white px-3 py-1.5" href={href(f, { page: result.page - 1 })}>← Previous</Link>}
          <span className="px-3 text-muted">Page {result.page} of {result.pages}</span>
          {result.page < result.pages && <Link className="rounded border border-cream bg-white px-3 py-1.5" href={href(f, { page: result.page + 1 })}>Next →</Link>}
        </nav>
      )}
    </div>
  );
}

function Select({ name, label, value, options, all }: { name: string; label: string; value?: string; options: [string, string][]; all?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <select name={name} defaultValue={value ?? ""} className="rounded border border-cream bg-ivory px-2 py-2 text-sm text-ink">
        {all && <option value="">{all}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}
