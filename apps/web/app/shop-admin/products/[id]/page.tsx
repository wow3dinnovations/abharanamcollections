import { rupees } from "@abh/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Input, PageHeader, Table, Td } from "@/components/admin/ui";
import { ProductImage } from "@/components/ProductImage";
import { PhotoButton } from "@/components/shop/PhotoButton";
import { PrintTagButton } from "@/components/shop/PrintTagButton";
import { ProductForm } from "@/components/shop/ProductForm";
import { requireAdmin } from "@/lib/admin";
import { getMasters, istDate } from "@/lib/shop/server";
import { setStock } from "../../actions";

const REASONS: Record<string, string> = { opening: "Added", adjust: "Stock changed", sale: "Sold", cancel: "Bill cancelled", import: "Imported", return: "Returned" };

export default async function ShopProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const [m, prod, stock, moves] = await Promise.all([
    getMasters(),
    supabase.from("products").select("*, shop_products(*)").eq("id", id).maybeSingle(),
    supabase.from("shop_stock").select("location_id, qty").eq("product_id", id),
    supabase.from("shop_stock_moves").select("*, shop_locations(name)").eq("product_id", id).order("created_at", { ascending: false }).limit(20),
  ]);
  const p = prod.data;
  if (!p) notFound();
  const sp = p.shop_products;
  const qtyAt = (loc: string) => stock.data?.find((s) => s.location_id === loc)?.qty ?? 0;
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

  return (
    <div className="space-y-6">
      <PageHeader title={`${p.sku} · ${p.name}`}>
        <div className="flex flex-wrap gap-2 text-sm">
          <PrintTagButton ids={[p.id]} className="rounded bg-maroon px-3 py-1.5 font-medium text-white disabled:opacity-60" />
          <Link href={`/admin/products/${p.id}`} className="rounded border border-cream bg-white px-3 py-1.5">Website extras</Link>
          {p.is_active && p.is_visible && <Link href={`/products/${p.slug}`} className="rounded border border-cream bg-white px-3 py-1.5">View on website</Link>}
        </div>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <ProductForm
          categories={m.categories}
          subcategories={m.subcategories}
          vendors={m.vendors}
          locations={m.locations}
          defaultMultiplier={Number(m.settings.default_multiplier)}
          guaranteeMonths={Number(m.settings.guarantee_months ?? 6)}
          initial={{
            id: p.id, sku: p.sku, name: p.name, category_id: s(p.category_id), subcategory_id: s(p.subcategory_id),
            vendor_id: s(sp?.vendor_id), location_id: s(sp?.location_id), purchase_rate: s(sp?.purchase_rate),
            multiplier: s(sp?.multiplier ?? m.settings.default_multiplier), price: s(p.price), mrp: s(p.mrp),
            purchase_date: s(sp?.purchase_date), invoice_no: s(sp?.invoice_no), rack: s(sp?.rack), barcode: s(sp?.barcode),
            design_number: p.design_number, size: p.size, colour: p.colour, material: p.material, collection: p.collection,
            description: p.description, is_active: p.is_active, guarantee_months: s(sp?.guarantee_months ?? 0),
          }}
        />
        <div className="space-y-4">
          <Card title="Photo">
            <div className="aspect-square overflow-hidden rounded border border-cream">
              <ProductImage path={p.image_paths[0]} alt={p.name} />
            </div>
            <PhotoButton productId={p.id} sku={p.sku} />
          </Card>
          <Card title={`Stock: ${p.stock_qty}`}>
            <div className="space-y-2">
              {m.locations.map((l) => (
                <form key={l.id} action={setStock} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="product_id" value={p.id} />
                  <input type="hidden" name="location_id" value={l.id} />
                  <span className="flex-1">{l.name}</span>
                  <Input name="qty" type="number" min="0" step="1" defaultValue={qtyAt(l.id)} className="w-20" aria-label={`Quantity at ${l.name}`} />
                  <Button variant="secondary">Set</Button>
                </form>
              ))}
              {!m.locations.length && <p className="text-sm text-muted">Add a location first.</p>}
            </div>
          </Card>
          <Card title="Stock history">
            <Table head={["When", "Change", ""]}>
              {(moves.data ?? []).map((mv) => (
                <tr key={mv.id}>
                  <Td className="text-xs text-muted">{istDate(mv.created_at)}</Td>
                  <Td className={mv.change < 0 ? "text-red-700" : "text-green-700"}>{mv.change > 0 ? `+${mv.change}` : mv.change}</Td>
                  <Td className="text-xs">{REASONS[mv.reason] ?? mv.reason} {mv.ref} {mv.shop_locations?.name ? `· ${mv.shop_locations.name}` : ""} {mv.note}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <p className="text-xs text-muted">Added {istDate(p.added_at)} · Price {rupees(p.price)}</p>
        </div>
      </div>
    </div>
  );
}
