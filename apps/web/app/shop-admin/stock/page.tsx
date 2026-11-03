import Link from "next/link";
import { Button, Input, PageHeader, Table, Td } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin";
import { getMasters, istDate, searchTerm } from "@/lib/shop/server";
import { setStock } from "../actions";

const PAGE = 50;
const REASONS: Record<string, string> = { opening: "Added", adjust: "Changed", sale: "Sold", cancel: "Bill cancelled", import: "Imported" };

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; empty?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const m = await getMasters();
  const page = Math.max(1, Number(sp.page) || 1);
  const q = searchTerm(sp.q ?? "");
  let query = supabase
    .from("products")
    .select("id, sku, name, stock_qty, shop_stock(location_id, qty)", { count: "exact" })
    .eq("is_active", true)
    .order("sku")
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
  if (sp.empty) query = query.eq("stock_qty", 0);
  const [{ data, count }, moves] = await Promise.all([
    query,
    supabase.from("shop_stock_moves").select("id, change, reason, ref, note, created_at, products(id, sku), shop_locations(name)").order("created_at", { ascending: false }).limit(15),
  ]);
  const locs = m.locations.filter((l) => l.is_active);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) => `/shop-admin/stock?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.empty ? { empty: "1" } : {}), page: String(p) })}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Stock" />
      <form className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Code or name" className="w-56" />
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="empty" value="1" defaultChecked={!!sp.empty} /> Only sold out</label>
        <Button variant="secondary">Search</Button>
      </form>
      <p className="text-xs text-muted">Type the counted quantity and press Set. Every change is kept in the product&apos;s stock history.</p>
      <Table head={["Code", "Name", ...locs.map((l) => l.name), "Total"]}>
        {(data ?? []).map((p) => (
          <tr key={p.id}>
            <Td><Link href={`/shop-admin/products/${p.id}`} className="font-medium underline">{p.sku}</Link></Td>
            <Td>{p.name}</Td>
            {locs.map((l) => (
              <Td key={l.id}>
                <form action={setStock} className="flex items-center gap-1">
                  <input type="hidden" name="product_id" value={p.id} />
                  <input type="hidden" name="location_id" value={l.id} />
                  <Input name="qty" type="number" min="0" step="1" defaultValue={p.shop_stock.find((s) => s.location_id === l.id)?.qty ?? 0} className="w-16" aria-label={`${p.sku} at ${l.name}`} />
                  <Button variant="secondary" className="px-2">Set</Button>
                </form>
              </Td>
            ))}
            <Td className="font-semibold">{p.stock_qty}</Td>
          </tr>
        ))}
      </Table>
      {pages > 1 && (
        <nav className="flex items-center gap-3 text-sm">
          {page > 1 && <Link href={link(page - 1)} className="underline">← Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link href={link(page + 1)} className="underline">Next →</Link>}
        </nav>
      )}
      <h2 className="pt-4 font-semibold">Latest stock changes</h2>
      <Table head={["When", "Product", "Change", "Why"]}>
        {(moves.data ?? []).map((mv) => (
          <tr key={mv.id}>
            <Td className="text-xs text-muted">{istDate(mv.created_at)}</Td>
            <Td>{mv.products ? <Link href={`/shop-admin/products/${mv.products.id}`} className="underline">{mv.products.sku}</Link> : "–"}</Td>
            <Td className={mv.change < 0 ? "text-red-700" : "text-green-700"}>{mv.change > 0 ? `+${mv.change}` : mv.change}</Td>
            <Td className="text-xs">{REASONS[mv.reason] ?? mv.reason} {mv.ref} {mv.shop_locations?.name ? `· ${mv.shop_locations.name}` : ""} {mv.note}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
