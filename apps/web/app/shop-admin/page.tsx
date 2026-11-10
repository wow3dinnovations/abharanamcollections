import { barcodeSvg, rupees } from "@abh/core";
import Link from "next/link";
import { Badge, Card, Table, Td } from "@/components/admin/ui";
import { ProductImage } from "@/components/ProductImage";
import { CodeSearch } from "@/components/shop/CodeSearch";
import { PrintTagButton } from "@/components/shop/PrintTagButton";
import { HeroStat, ProfitTiles, Section, Stat } from "@/components/shop/Stats";
import { requireAdmin } from "@/lib/admin";
import { lookupCode, type LookupProduct } from "@/lib/shop/lookup";
import { getReport, monthName } from "@/lib/shop/reports";
import { getStoreName, istDate, istToday } from "@/lib/shop/server";

// Stock age groups (same as shop_stock_age_summary); `from` links to the Stock page filter.
const AGE_GROUPS = [
  { label: "Up to 1 month", from: "" },
  { label: "1–3 months", from: "30" },
  { label: "3–6 months", from: "90" },
  { label: "6–12 months", from: "180" },
  { label: "Over 1 year", from: "365" },
];

export default async function ShopDashboard({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const today = istToday();
  const monthStart = today.slice(0, 8) + "01";
  const [store, todayRows, monthRows, summary, recent, low, ages, pending, lookup] = await Promise.all([
    getStoreName(),
    getReport(today, today, "total"),
    getReport(monthStart, today, "total"),
    supabase.rpc("shop_summary"),
    supabase.from("shop_sales").select("id, number, customer_name, total, status, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("products").select("id, sku, name, stock_qty").eq("is_active", true).lte("stock_qty", 0).order("added_at", { ascending: false }).limit(8),
    supabase.rpc("shop_stock_age_summary"),
    supabase.from("shop_returns").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sp.code?.trim() ? lookupCode(sp.code) : Promise.resolve(null),
  ]);
  const t = todayRows[0]!;
  const m = monthRows[0]!;
  const n = (summary.data ?? {}) as Record<string, number>;
  const ageRows = ((ages.data ?? []) as { bucket: number; products: number; pieces: number; cost: number; value: number }[]).map((r) => ({
    ...r,
    ...AGE_GROUPS[r.bucket]!,
  }));
  const dateText = new Date(`${today}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">Dashboard</h1>
          <p className="text-sm uppercase tracking-wide text-muted">
            {store.name} · {dateText}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/shop-admin/pos" className="rounded-md bg-maroon px-3 py-1.5 text-sm font-medium text-white">New bill</Link>
          <Link href="/shop-admin/products/new" className="rounded-md border border-cream bg-white px-3 py-1.5 text-sm font-medium">Add product</Link>
          <Link href="/shop-admin/expenses" className="rounded-md border border-cream bg-white px-3 py-1.5 text-sm font-medium">Add expense</Link>
        </div>
      </div>

      <CodeLookupCard code={sp.code ?? ""} result={lookup} />

      {(pending.count ?? 0) > 0 && (
        <Link href="/shop-admin/returns" className="block rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>{pending.count}</b> return / cancellation request{pending.count === 1 ? "" : "s"} waiting for your approval →
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,4fr)]">
        <HeroStat
          label="Today's net sales"
          value={rupees(t.net_sales)}
          sub={`${t.bills} bill${t.bills === 1 ? "" : "s"} · ${t.items - t.returned_items} item${t.items - t.returned_items === 1 ? "" : "s"} sold`}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Bills today" value={t.bills} money={false} />
          <Stat label="Items sold today" value={t.items - t.returned_items} money={false} />
          <Stat label="Gross sales today" value={t.gross} />
          <Stat label="Discount today" value={t.discount} />
          <Stat label="Expenses today" value={t.expenses} tone={t.expenses > 0 ? "bad" : "plain"} />
          <Stat label="Month sales" value={m.net_sales} sub={monthName(today)} />
          <Stat label="Month bills" value={m.bills} money={false} />
          <Stat label="Month items" value={m.items - m.returned_items} money={false} />
        </div>
      </div>

      <Section
        title="This month · profit"
        note="Estimates for running the shop, not formal accounting. Stock you buy is not an expense: it becomes cost only when the pieces are sold."
        action={<Link href="/shop-admin/sales/monthly" className="text-sm underline">Month by month →</Link>}
      >
        <ProfitTiles r={m} />
      </Section>

      <Section title="Stock now">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Products" value={n.products ?? 0} money={false} />
          <Stat label="Pieces in stock" value={n.units ?? 0} money={false} />
          <Stat label="At purchase rate" value={n.cost ?? 0} />
          <Stat label="At selling price" value={n.value ?? 0} />
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Stock age">
          <Table head={["How old", "Products", "Pieces", "At purchase rate", "At selling price"]}>
            {ageRows.map((r) => (
              <tr key={r.bucket}>
                <Td>
                  <Link className="underline" href={`/shop-admin/stock?sort=age${r.from ? `&age=${r.from}` : ""}`}>{r.label}</Link>
                </Td>
                <Td>{r.products}</Td>
                <Td>{r.pieces}</Td>
                <Td>{rupees(r.cost)}</Td>
                <Td>{rupees(r.value)}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-xs text-muted">Pieces in stock now, by how long ago they were bought.</p>
        </Card>
        <Card title="Latest bills">
          <Table head={["Bill", "Customer", "Total", "When"]}>
            {(recent.data ?? []).map((s) => (
              <tr key={s.id}>
                <Td><Link className="underline" href={`/shop-admin/sales/${s.id}`}>{s.number}</Link> {s.status === "cancelled" && <Badge tone="bad">Cancelled</Badge>}</Td>
                <Td>{s.customer_name || "–"}</Td>
                <Td>{rupees(s.total)}</Td>
                <Td className="text-xs text-muted">{istDate(s.created_at)}</Td>
              </tr>
            ))}
          </Table>
          {!recent.data?.length && <p className="text-sm text-muted">No bills yet.</p>}
        </Card>
      </div>
      <Card title="Sold out">
        <div className="flex flex-wrap gap-2">
          {(low.data ?? []).map((p) => (
            <Link key={p.id} href={`/shop-admin/products/${p.id}`} className="rounded-md border border-cream px-2 py-1 text-sm hover:bg-cream">
              <b className="font-mono">{p.sku}</b> {p.name}
            </Link>
          ))}
        </div>
        {!low.data?.length && <p className="text-sm text-muted">Nothing is sold out.</p>}
      </Card>
    </div>
  );
}

function CodeLookupCard({ code, result }: { code: string; result: Awaited<ReturnType<typeof lookupCode>> | null }) {
  const x = result?.exact;
  const familyPieces = (result?.family ?? []).reduce((a, p) => a + p.stock_qty, 0);
  return (
    <section className="rounded-2xl border border-cream bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-2">
        <CodeSearch initial={code} autoFocus={!code} />
        {code && <Link href="/shop-admin" className="px-2 py-2.5 text-sm underline">Clear</Link>}
      </div>

      {result && (
        <div className="mt-4 space-y-5">
          {x ? (
            <div className="grid gap-4 md:grid-cols-[120px_1fr_auto]">
              <div className="h-28 w-28 overflow-hidden rounded-lg bg-cream">
                <ProductImage path={x.image} alt={x.name} label={x.sku} />
              </div>
              <div className="space-y-1">
                <p className="font-mono text-xl font-bold">{x.sku}</p>
                <p className="text-sm">{x.name}{x.size ? ` · Size ${x.size}` : ""}</p>
                <p className="text-sm text-muted">{[x.category, x.vendor].filter(Boolean).join(" · ")} · {rupees(x.price)}</p>
                <p className="pt-1">
                  <span className={`font-display text-3xl font-bold ${x.stock_qty > 0 ? "text-green-700" : "text-red-700"}`}>{x.stock_qty}</span>{" "}
                  <span className="text-sm">piece{x.stock_qty === 1 ? "" : "s"} available</span>
                  {x.stock.length > 0 && <span className="text-sm text-muted"> ({x.stock.map((s) => `${s.location} ${s.qty}`).join(", ")})</span>}
                </p>
                <div className="flex flex-wrap gap-2 pt-1 text-sm">
                  <PrintTagButton ids={[x.id]} className="rounded-md bg-maroon px-3 py-1 font-medium text-white disabled:opacity-60" />
                  <Link href={`/shop-admin/products/${x.id}`} className="rounded-md border border-cream px-3 py-1">Open product</Link>
                  <Link href="/shop-admin/pos" className="rounded-md border border-cream px-3 py-1">New bill</Link>
                </div>
              </div>
              <div className="w-56 text-center">
                <div className="h-14 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: barcodeSvg(x.sku) }} />
                <p className="font-mono text-xs tracking-widest">{x.sku}</p>
                {x.barcode && <p className="text-[11px] text-muted">Barcode no. {x.barcode}</p>}
              </div>
            </div>
          ) : (
            <p className="text-sm">
              No product has the code <b className="font-mono">{result.term}</b>.{" "}
              {result.family.length > 0 ? "Codes like it are below." : ""}{" "}
              <Link href={`/shop-admin/products/new?sku=${encodeURIComponent(result.term)}`} className="underline">Add it as a new product</Link>
            </p>
          )}

          {result.family.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">
                {x ? `Other codes starting with ${result.term}` : "Codes like it"}: {result.family.length}
                {result.family.length >= 60 ? "+" : ""} product{result.family.length === 1 ? "" : "s"}, {familyPieces} piece{familyPieces === 1 ? "" : "s"} available
              </h3>
              <ProductGrid items={result.family} />
            </div>
          )}

          {result.similar.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Similar products{x?.category ? ` in ${x.category}` : ""}</h3>
              <ProductGrid items={result.similar} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProductGrid({ items }: { items: LookupProduct[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.slice(0, 24).map((p) => (
        <Link key={p.id} href={`/shop-admin?code=${encodeURIComponent(p.sku)}`} className="overflow-hidden rounded-lg border border-cream hover:border-gold">
          <div className="aspect-square bg-cream">
            <ProductImage path={p.image} alt={p.name} label={p.sku} />
          </div>
          <div className="p-2 text-xs">
            <p className="font-mono font-semibold">{p.sku}</p>
            <p className="truncate">{p.name}{p.size ? ` · ${p.size}` : ""}</p>
            <p className="flex justify-between">
              <span>{rupees(p.price)}</span>
              <span className={p.stock_qty > 0 ? "text-green-700" : "text-red-700"}>{p.stock_qty} in stock</span>
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
