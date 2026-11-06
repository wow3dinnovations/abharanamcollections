import { awaitingPayment, orderStageLabel, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, rupees, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@abh/core";
import Link from "next/link";
import { PageHeader, Table, Td } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin";
import { STATUS_TONE, type ShippingAddress } from "@/lib/orders";

const FILTERS: [string, string][] = [
  ["", "All"], ["placed", "New"], ["to_ship", "To pack & ship"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["unpaid", "Awaiting payment"], ["cancelled", "Cancelled"],
];

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = "", q = "" } = await searchParams;
  const { supabase } = await requireAdmin();
  let query = supabase
    .from("orders")
    .select("id, number, status, payment_method, payment_status, total, shipping_address, created_at, order_items(quantity)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status === "to_ship") query = query.in("status", ["confirmed", "packed"]);
  else if (status === "placed") query = query.eq("status", "placed").or("payment_status.eq.paid,payment_method.eq.cod");
  else if (status === "unpaid") query = query.eq("status", "placed").eq("payment_status", "pending").neq("payment_method", "cod");
  else if (status) query = query.eq("status", status as OrderStatus);
  const term = q.replace(/[%_,()\\]/g, " ").trim();
  if (term) query = query.or(`number.ilike.%${term}%,email.ilike.%${term}%,shipping_address->>phone.ilike.%${term}%,shipping_address->>full_name.ilike.%${term}%`);
  const { data } = await query;

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" />
      <nav className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={k ? `/admin/orders?status=${k}` : "/admin/orders"} className={`rounded-full px-3 py-1 ${status === k ? "bg-maroon text-white" : "bg-white border border-cream"}`}>
            {label}
          </Link>
        ))}
      </nav>
      <form className="flex gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Order no., name, phone or email" className="w-72 rounded border border-cream px-2 py-1.5 text-sm" />
        <button className="rounded border border-cream bg-white px-3 text-sm">Search</button>
      </form>
      <Table head={["Order", "When", "Customer", "Pieces", "Total", "Payment", "Status"]}>
        {(data ?? []).map((o) => {
          const a = o.shipping_address as ShippingAddress;
          return (
            <tr key={o.id}>
              <Td><Link href={`/admin/orders/${o.id}`} className="font-medium underline">{o.number}</Link></Td>
              <Td className="text-xs text-muted">{new Date(o.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</Td>
              <Td>{a.full_name}<br /><span className="text-xs text-muted">{a.phone} · {a.city}</span></Td>
              <Td>{o.order_items.reduce((s, i) => s + i.quantity, 0)}</Td>
              <Td>{rupees(o.total)}</Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[o.payment_status]}`}>{PAYMENT_STATUS_LABEL[o.payment_status as PaymentStatus]}</span>
                <br /><span className="text-xs text-muted">{PAYMENT_LABEL[o.payment_method as PaymentMethod].split(" (")[0]}</span>
              </Td>
              <Td><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[awaitingPayment(o) ? "pending" : o.status]}`}>{orderStageLabel(o)}</span></Td>
            </tr>
          );
        })}
      </Table>
      {!data?.length && <p className="text-sm text-muted">No orders here.</p>}
    </div>
  );
}
