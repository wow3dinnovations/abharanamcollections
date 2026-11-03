import { rupees } from "@abh/core";
import Link from "next/link";
import { Badge, Button, Field, Input, PageHeader, Table, Td } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin";
import { istDate, istDayStart, istToday } from "@/lib/shop/server";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const from = day.test(sp.from ?? "") ? sp.from! : istToday().slice(0, 8) + "01";
  const to = day.test(sp.to ?? "") ? sp.to! : istToday();
  const end = new Date(new Date(istDayStart(to)).getTime() + 86400000).toISOString();
  let query = supabase
    .from("shop_sales")
    .select("id, number, customer_name, customer_phone, total, discount, payment_method, status, created_at, shop_locations(name)")
    .gte("created_at", istDayStart(from))
    .lt("created_at", end)
    .order("created_at", { ascending: false })
    .limit(500);
  const q = (sp.q ?? "").replace(/[%_,()\\]/g, " ").trim();
  if (q) query = query.or(`number.ilike.%${q}%,customer_name.ilike.%${q}%,customer_phone.ilike.%${q}%`);
  const { data } = await query;
  const paid = (data ?? []).filter((s) => s.status === "paid");
  const total = paid.reduce((a, s) => a + Number(s.total), 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Bills">
        <Link href="/shop-admin/pos" className="rounded bg-maroon px-3 py-1.5 text-sm font-medium text-white">New bill</Link>
      </PageHeader>
      <form className="flex flex-wrap items-end gap-2">
        <Field label="From"><Input type="date" name="from" defaultValue={from} /></Field>
        <Field label="To"><Input type="date" name="to" defaultValue={to} /></Field>
        <Field label="Bill no., name or phone"><Input name="q" defaultValue={sp.q} /></Field>
        <Button variant="secondary">Show</Button>
      </form>
      <p className="text-sm">{paid.length} bills · <b>{rupees(total)}</b></p>
      <Table head={["Bill", "When", "Shop", "Customer", "Paid by", "Total"]}>
        {(data ?? []).map((s) => (
          <tr key={s.id} className={s.status === "cancelled" ? "opacity-60" : ""}>
            <Td><Link href={`/shop-admin/sales/${s.id}`} className="font-medium underline">{s.number}</Link> {s.status === "cancelled" && <Badge tone="bad">Cancelled</Badge>}</Td>
            <Td className="text-xs text-muted">{istDate(s.created_at)}</Td>
            <Td>{s.shop_locations?.name ?? "–"}</Td>
            <Td>{s.customer_name || "–"} <span className="text-xs text-muted">{s.customer_phone}</span></Td>
            <Td>{s.payment_method}</Td>
            <Td>{rupees(s.total)}</Td>
          </tr>
        ))}
      </Table>
      {!data?.length && <p className="text-sm text-muted">No bills in these dates.</p>}
    </div>
  );
}
