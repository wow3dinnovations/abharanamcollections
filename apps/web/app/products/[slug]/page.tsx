import { rupees, whatsappLink } from "@abh/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Price } from "@/components/Price";
import { ProductGrid } from "@/components/ProductCard";
import { WishButton } from "@/components/WishButton";
import { getProduct, getRelated, getSettings } from "@/lib/catalog";
import { photoUrl, SITE_URL } from "@/lib/storage";
import { AddToBag } from "./AddToBag";
import { Gallery } from "./Gallery";
import { ShareButton } from "./ShareButton";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return { title: "Not found" };
  const image = photoUrl(p.image_paths?.[0]);
  return {
    title: `${p.name} (${p.sku})`,
    description: p.description?.slice(0, 160) || `${p.name} in 1 gram gold finish. ${rupees(p.price)}.`,
    openGraph: image ? { images: [image] } : undefined,
    alternates: { canonical: `/products/${p.slug}` },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [p, settings] = await Promise.all([getProduct(slug), getSettings()]);
  if (!p || !p.id) notFound();
  const related = await getRelated(p);
  const showPrice = settings?.show_prices ?? true;
  const url = `${SITE_URL}/products/${p.slug}`;
  const wa = whatsappLink(settings?.whatsapp_number ?? "", `Hello! I'm interested in ${p.name} (${p.sku}).\n${url}`);
  const specs: [string, string | null | undefined][] = [
    ["Design no.", p.sku],
    ["Category", [p.category_name, p.subcategory_name].filter(Boolean).join(" · ")],
    ["Collection", p.collection],
    ["Material", p.material ? `${p.material} (1 gram gold finish)` : "1 gram gold finish"],
    ["Colour / stones", p.colour],
    ["Size", p.size],
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    image: (p.image_paths ?? []).map((x) => photoUrl(x)),
    description: p.description || undefined,
    category: p.category_name || undefined,
    offers: showPrice
      ? {
          "@type": "Offer",
          priceCurrency: "INR",
          price: p.price,
          availability: p.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url,
        }
      : undefined,
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-4 text-xs text-muted" aria-label="Breadcrumb">
        <Link href="/" className="hover:underline">Home</Link> / <Link href="/shop" className="hover:underline">Shop</Link>
        {p.category_slug && (
          <> / <Link href={`/shop?category=${p.category_slug}`} className="hover:underline">{p.category_name}</Link></>
        )}
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        <Gallery paths={p.image_paths ?? []} alt={p.name} label={p.category_name} />
        <div className="space-y-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-gold">{p.category_name ?? "1 gram gold"}</p>
            <h1 className="mt-1 text-4xl font-semibold leading-tight">{p.name}</h1>
            <p className="mt-1 text-sm text-muted">Design no. {p.sku}</p>
          </div>
          {showPrice ? <Price price={p.price} mrp={p.mrp} size="lg" /> : <p className="text-lg text-maroon">Price on request</p>}
          <p className={`text-sm font-medium ${p.in_stock ? "text-green-800" : "text-red-800"}`}>
            {p.in_stock
              ? settings?.show_stock_count && p.stock_qty <= 5
                ? `In stock: only ${p.stock_qty} left`
                : "In stock"
              : "Sold out: send an enquiry and we'll tell you when it's back"}
          </p>

          <AddToBag p={{ id: p.id, sku: p.sku, name: p.name, price: Number(p.price), slug: p.slug, inStock: !!p.in_stock }} />

          <div className="flex flex-wrap items-center gap-5 border-y border-cream py-3">
            <WishButton id={p.id} withLabel />
            <ShareButton title={p.name} url={url} />
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-green-800">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 12 12 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2s.2-1.1.1-1.2-.2-.2-.5-.3z" />
                </svg>
                Ask on WhatsApp
              </a>
            )}
          </div>

          {p.description && <p className="whitespace-pre-line text-sm leading-relaxed text-ink/90">{p.description}</p>}

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-lg border border-cream bg-white p-4 text-sm">
            {specs.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          <ul className="space-y-1 text-xs text-muted">
            <li>• One gram gold / imitation jewellery. Not solid gold.</li>
            <li>• Colours may look slightly different on your screen.</li>
            <li>• <Link href="/care" className="underline">How to care for your jewellery</Link></li>
          </ul>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-3xl font-semibold text-maroon">You may also like</h2>
          <ProductGrid items={related} showPrice={showPrice} />
        </section>
      )}
    </div>
  );
}
