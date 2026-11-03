import { rupees } from "@abh/core";
import Link from "next/link";
import { Badge, Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin";
import { istDate } from "@/lib/shop/server";

export default async function ShopDashboard() {
  const { supabase } = await requireAdmin();
  const [summary, recent, low] = await Promise.all([
    supabase.rpc("shop_summary"),
    supabase.from("shop_sales").select("id, number, customer_name, total, status, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("products").select("id, sku, name, stock_qty").eq("is_active", true).lte("stock_qty", 0).order("added_at", { ascending: false }).limit(8),
  ]);
  const n = (summary.data ?? {}) as Record<string, number>;
  const tiles = [
    { label: "Products", value: String(n.products ?? 0) },
    { label: "Pieces in stock", value: String(n.units ?? 0) },
    { label: "Stock at purchase rate", value: rupees(n.cost) },
    { label: "Stock at selling price", value: rupees(n.value) },
    { label: "Sales today", value: `${rupees(n.sales_today)} (${n.bills_today ?? 0} bills)` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Shop software">
        <div className="flex gap-2">
          <Link href="/shop-admin/products/new" className="rounded bg-maroon px-3 py-1.5 text-sm font-medium text-white">Add product</Link>
          <Link href="/shop-admin/pos" className="rounded border border-cream bg-white px-3 py-1.5 text-sm font-medium">New bill</Link>
        </div>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-cream bg-white p-4">
            <p className="text-xs text-muted">{t.label}</p>
            <p className="mt-1 text-lg font-semibold">{t.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
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
        <Card title="Sold out">
          <Table head={["Code", "Name"]}>
            {(low.data ?? []).map((p) => (
              <tr key={p.id}>
                <Td><Link className="underline" href={`/shop-admin/products/${p.id}`}>{p.sku}</Link></Td>
                <Td>{p.name}</Td>
              </tr>
            ))}
          </Table>
          {!low.data?.length && <p className="text-sm text-muted">Nothing is sold out.</p>}
        </Card>
      </div>
    </div>
  );
}
