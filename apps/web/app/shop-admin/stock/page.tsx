import Link from "next/link";
import { Button, Input, PageHeader, Select, Table, Td } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin";
import { getMasters, istDate, searchTerm } from "@/lib/shop/server";
import { setStock } from "../actions";

const PAGE = 50;
const REASONS: Record<string, string> = { opening: "Added", adjust: "Changed", sale: "Sold", cancel: "Bill cancelled", import: "Imported" };

const AGES = [
  { v: "", label: "Any age" },
  { v: "30", label: "Older than 30 days" },
  { v: "90", label: "Older than 3 months" },
  { v: "180", label: "Older than 6 months" },
  { v: "365", label: "Older than 1 year" },
];

/** 45 -> "1 m 15 d", 400 -> "1 y 1 m". */
function ageText(days: number | null) {
  if (days === null) return "–";
  if (days < 31) return `${days} d`;
  const y = Math.floor(days / 365), mo = Math.floor((days % 365) / 30), d = (days % 365) % 30;
  return y ? `${y} y${mo ? ` ${mo} m` : ""}` : `${mo} m${d ? ` ${d} d` : ""}`;
}

function ageTone(days: number | null) {
  if (days === null || days <= 90) return "";
  if (days <= 180) return "text-amber-700";
  return "font-medium text-red-700";
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; empty?: string; age?: string; sort?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const m = await getMasters();
  const page = Math.max(1, Number(sp.page) || 1);
  const q = searchTerm(sp.q ?? "");
  const minAge = Number(sp.age) || 0;
  const oldest = sp.sort === "age";
  // The page of products comes from the stock age list (code, name, total, age), then their stock per location.
  let query = supabase
    .from("shop_stock_age")
    .select("id, sku, name, stock_qty, since, age_days", { count: "exact" })
    .eq("is_active", true)
    .range((page - 1) * PAGE, page * PAGE - 1);
  query = oldest ? query.order("age_days", { ascending: false }).order("sku") : query.order("sku");
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
  if (sp.empty) query = query.eq("stock_qty", 0);
  else if (minAge) query = query.gt("stock_qty", 0);
  if (minAge) query = query.gt("age_days", minAge);
  const [{ data: rows, count }, moves] = await Promise.all([
    query,
    supabase.from("shop_stock_moves").select("id, change, reason, ref, note, created_at, products(id, sku), shop_locations(name)").order("created_at", { ascending: false }).limit(15),
  ]);
  const ids = (rows ?? []).map((r) => r.id!).filter(Boolean);
  const { data: stockRows } = ids.length
    ? await supabase.from("shop_stock").select("product_id, location_id, qty").in("product_id", ids)
    : { data: [] as { product_id: string; location_id: string; qty: number }[] };
  const data = (rows ?? []).map((r) => ({
    id: r.id!, sku: r.sku ?? "", name: r.name ?? "", stock_qty: r.stock_qty ?? 0, since: r.since, age_days: r.age_days,
    shop_stock: (stockRows ?? []).filter((s) => s.product_id === r.id),
  }));
  const locs = m.locations.filter((l) => l.is_active);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) =>
    `/shop-admin/stock?${new URLSearchParams({
      ...(sp.q ? { q: sp.q } : {}),
      ...(sp.empty ? { empty: "1" } : {}),
      ...(minAge ? { age: String(minAge) } : {}),
      ...(oldest ? { sort: "age" } : {}),
      page: String(p),
    })}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Stock" />
      <form className="flex flex-wrap items-center gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Code or name" className="w-56" />
        <Select name="age" defaultValue={minAge ? String(minAge) : ""} aria-label="Stock age">
          {AGES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
        </Select>
        <Select name="sort" defaultValue={oldest ? "age" : ""} aria-label="Order">
          <option value="">By code</option>
          <option value="age">Oldest first</option>
        </Select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="empty" value="1" defaultChecked={!!sp.empty} /> Only sold out</label>
        <Button variant="secondary">Search</Button>
      </form>
      <p className="text-xs text-muted">
        Type the counted quantity and press Set. Every change is kept in the product&apos;s stock history.
        Age is counted from the purchase date (or the day the product was added).
      </p>
      <Table head={["Code", "Name", "Age", ...locs.map((l) => l.name), "Total"]}>
        {data.map((p) => (
          <tr key={p.id}>
            <Td><Link href={`/shop-admin/products/${p.id}`} className="font-medium underline">{p.sku}</Link></Td>
            <Td>{p.name}</Td>
            <Td className={`whitespace-nowrap ${ageTone(p.age_days)}`}><span title={p.since ? `Since ${istDate(p.since, false)}` : undefined}>{ageText(p.age_days)}</span></Td>
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
