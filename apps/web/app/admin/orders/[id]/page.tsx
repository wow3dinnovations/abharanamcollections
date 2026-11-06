import { ORDER_STATUS_LABEL, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, rupees, whatsappLink, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@abh/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Field, Input, PageHeader, Select, Table, Td, Textarea } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin";
import { ORDER_COLUMNS, type ShippingAddress } from "@/lib/orders";
import { updateOrder } from "../actions";

const when = (d: string) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function AdminOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();
  const [{ data: o }, items, history, payments, note] = await Promise.all([
    supabase.from("orders").select(`${ORDER_COLUMNS}, email`).eq("id", id).maybeSingle(),
    supabase.from("order_items").select("id, product_id, sku, name, price, quantity, line_total").eq("order_id", id).order("id"),
    supabase.from("order_status_history").select("id, status, note, created_at").eq("order_id", id).order("created_at"),
    supabase.from("payments").select("id, method, gateway_payment_id, amount, status, note, created_at").eq("order_id", id).order("created_at"),
    supabase.rpc("order_admin_note", { p_order: id }),
  ]);
  if (!o) notFound();
  const a = o.shipping_address as ShippingAddress;
  const wa = whatsappLink(`91${a.phone}`, `Hello ${a.full_name}, about your Abharanam order ${o.number}: `);

  return (
    <div className="space-y-6">
      <PageHeader title={`Order ${o.number}`}>
        <Link href="/admin/orders" className="text-sm underline">← All orders</Link>
      </PageHeader>
      {sp.saved && <p className="rounded bg-green-50 p-2 text-sm text-green-800">Saved.</p>}
      {sp.error && <p className="rounded bg-red-50 p-2 text-sm text-red-800">{sp.error}</p>}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card title="Pieces">
            <Table head={["Design", "Name", "Price", "Qty", "Amount"]}>
              {(items.data ?? []).map((i) => (
                <tr key={i.id}>
                  <Td>{i.product_id ? <Link href={`/shop-admin/products/${i.product_id}`} className="underline">{i.sku}</Link> : i.sku}</Td>
                  <Td>{i.name}</Td>
                  <Td>{rupees(i.price)}</Td>
                  <Td>{i.quantity}</Td>
                  <Td>{rupees(i.line_total)}</Td>
                </tr>
              ))}
            </Table>
            <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
              <dt>Items</dt><dd className="text-right">{rupees(o.subtotal)}</dd>
              <dt>Delivery</dt><dd className="text-right">{rupees(o.shipping_fee)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{rupees(o.total)}</dd>
            </dl>
            <p className="mt-2 text-xs text-muted">The pieces were taken out of shop stock when the order was placed. Cancelling puts them back.</p>
          </Card>
          <Card title="Customer and delivery">
            <p className="text-sm">
              <strong>{a.full_name}</strong> · {a.phone} · {o.email}
              <br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}
            </p>
            {o.customer_notes && <p className="mt-2 text-sm">Customer note: {o.customer_notes}</p>}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-full bg-green-700 px-4 py-1.5 text-sm text-white">WhatsApp the customer</a>}
          </Card>
          <Card title="Payments">
            <p className="mb-2 text-sm">{PAYMENT_LABEL[o.payment_method as PaymentMethod]} · <strong>{PAYMENT_STATUS_LABEL[o.payment_status as PaymentStatus]}</strong>{o.paid_at && ` on ${when(o.paid_at)}`}</p>
            <Table head={["When", "Amount", "Result", "Reference"]}>
              {(payments.data ?? []).map((p) => (
                <tr key={p.id}>
                  <Td className="text-xs">{when(p.created_at)}</Td>
                  <Td>{rupees(p.amount)}</Td>
                  <Td>{PAYMENT_STATUS_LABEL[p.status as PaymentStatus]}</Td>
                  <Td className="text-xs">{p.gateway_payment_id ?? p.note}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="History">
            <ul className="space-y-1 text-sm">
              {(history.data ?? []).map((h) => (
                <li key={h.id}><span className="text-xs text-muted">{when(h.created_at)}</span> · {ORDER_STATUS_LABEL[h.status as OrderStatus]} {h.note && `· ${h.note}`}</li>
              ))}
            </ul>
          </Card>
        </div>
        <Card title="Update">
          <form action={updateOrder} className="space-y-3">
            <input type="hidden" name="id" value={o.id} />
            <Field label="Order status">
              <Select name="status" defaultValue={o.status} disabled={o.status === "cancelled"}>
                {(["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"] as OrderStatus[]).map((s) => (
                  <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Payment">
              <Select name="payment_status" defaultValue={o.payment_status}>
                {(["pending", "paid", "failed", "refunded"] as PaymentStatus[]).map((s) => (
                  <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Courier and tracking number (the customer sees this)">
              <Input name="tracking" defaultValue={o.tracking} placeholder="DTDC D12345678" />
            </Field>
            <Field label="Private note (only admins see this)">
              <Textarea name="admin_note" rows={3} defaultValue={(note.data as string | null) ?? ""} />
            </Field>
            <Button>Save</Button>
            <p className="text-xs text-muted">Choosing Cancelled puts the pieces back into stock. For a paid order, refund the customer (Razorpay dashboard → Payments → Refund, or by UPI) and set Payment to Refunded.</p>
          </form>
        </Card>
      </div>
    </div>
  );
}
