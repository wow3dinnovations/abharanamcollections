import { PageHeader } from "@/components/admin/ui";
import { TagPrinter } from "@/components/shop/TagPrinter";
import { requireAdmin } from "@/lib/admin";
import { getMasters, getStoreName } from "@/lib/shop/server";

export default async function TagsPage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const sp = await searchParams;
  const ids = (Array.isArray(sp.id) ? sp.id : sp.id ? [sp.id] : []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500);
  const { supabase } = await requireAdmin();
  const [m, store, rows] = await Promise.all([
    getMasters(),
    getStoreName(),
    ids.length
      ? supabase.from("products").select("id, sku, name, price, stock_qty, shop_products(barcode)").in("id", ids)
      : Promise.resolve({ data: [] as never[] }),
  ]);
  const items = (rows.data ?? [])
    .map((p: { id: string; sku: string; name: string; price: number; stock_qty: number; shop_products: { barcode: string | null } | null }) => ({
      id: p.id, sku: p.sku, name: p.name, price: Number(p.price), barcode: p.shop_products?.barcode ?? null, copies: 1,
    }))
    .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return (
    <div>
      <PageHeader title="Print tags" />
      <TagPrinter initial={items} width={Number(m.settings.tag_width_mm)} height={Number(m.settings.tag_height_mm)} brand={store.name} layout={m.settings.tag_layout} />
    </div>
  );
}
