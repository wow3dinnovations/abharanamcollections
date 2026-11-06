import { ORDER_STATUS_LABEL, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, rupees, upiLink, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@abh/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductImage } from "@/components/ProductImage";
import { getSettings } from "@/lib/catalog";
import { ORDER_COLUMNS, STATUS_TONE, type ShippingAddress } from "@/lib/orders";
import { createClient, getSessionProfile } from "@/lib/supabase/server";
import { cancelMyOrder } from "../actions";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

const STEPS: OrderStatus[] = ["placed", "confirmed", "packed", "shipped", "delivered"];

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; error?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const session = await getSessionProfile();
  if (!session) redirect(`/login?next=/orders/${id}`);
  const supabase = await createClient();
  const [{ data: o }, items, settings] = await Promise.all([
    supabase.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("order_items").select("id, product_id, sku, name, image_path, price, quantity, line_total").eq("order_id", id).order("id"),
    getSettings(),
  ]);
  if (!o) notFound();
  const a = o.shipping_address as ShippingAddress;
  const method = o.payment_method as PaymentMethod;
  const step = STEPS.indexOf(o.status as OrderStatus);
  const unpaid = o.payment_status === "pending" && o.status !== "cancelled";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.placed && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-5 text-center">
          <p className="font-display text-3xl font-semibold text-maroon">Thank you!</p>
          <p className="mt-1">Your order <strong>{o.number}</strong> is placed.{method === "upi_manual" ? " Please pay by UPI below." : " We'll call or WhatsApp you to confirm."}</p>
        </div>
      )}
      {sp.error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{sp.error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold text-maroon">Order {o.number}</h1>
        <span className="flex gap-1 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[o.status]}`}>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</span>
          {o.status !== "cancelled" && <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[o.payment_status]}`}>{PAYMENT_STATUS_LABEL[o.payment_status as PaymentStatus]}</span>}
        </span>
      </div>

      {o.status !== "cancelled" && (
        <ol className="grid grid-cols-5 gap-1 text-center text-[11px]">
          {STEPS.map((s, i) => (
            <li key={s} className={`rounded py-1 ${i <= step ? "bg-maroon text-white" : "bg-cream text-muted"}`}>{ORDER_STATUS_LABEL[s]}</li>
          ))}
        </ol>
      )}
      {o.tracking && <p className="rounded-xl border border-cream bg-white p-4 text-sm"><strong>Tracking:</strong> {o.tracking}</p>}

      {unpaid && method === "razorpay" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p>This order is waiting for payment. Please pay within 60 minutes of ordering to keep your pieces.</p>
          <Link href={`/pay/${o.id}?t=${o.pay_token}`} className="mt-3 inline-block rounded-full bg-maroon px-5 py-2 font-semibold text-white">Pay {rupees(o.total)} now</Link>
        </div>
      )}
      {unpaid && method === "upi_manual" && settings?.upi_id && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p>Please pay <strong>{rupees(o.total)}</strong> to our UPI ID <strong className="select-all">{settings.upi_id}</strong> and write <strong>{o.number}</strong> in the note. We confirm the order when we see the payment.</p>
          <a href={upiLink(settings.upi_id, settings.store_name, Number(o.total), o.number)} className="mt-3 inline-block rounded-full bg-maroon px-5 py-2 font-semibold text-white md:hidden">Open UPI app</a>
        </div>
      )}

      <section className="rounded-xl border border-cream bg-white">
        <ul className="divide-y divide-cream">
          {(items.data ?? []).map((i) => (
            <li key={i.id} className="flex gap-4 p-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-cream"><ProductImage path={i.image_path} alt="" /></div>
              <div className="flex-1">
                <p className="font-medium">{i.name}</p>
                <p className="text-xs text-muted">Design {i.sku} · {rupees(i.price)} × {i.quantity}</p>
              </div>
              <span>{rupees(i.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-1 border-t border-cream p-4 text-sm">
          <dt>Items</dt><dd className="text-right">{rupees(o.subtotal)}</dd>
          <dt>Delivery</dt><dd className="text-right">{Number(o.shipping_fee) ? rupees(o.shipping_fee) : "Free"}</dd>
          <dt className="text-lg font-semibold">Total</dt><dd className="text-right text-lg font-semibold text-maroon">{rupees(o.total)}</dd>
          <dt className="text-muted">Payment</dt><dd className="text-right text-muted">{PAYMENT_LABEL[method]}</dd>
        </dl>
      </section>

      <section className="rounded-xl border border-cream bg-white p-4 text-sm">
        <h2 className="mb-1 font-semibold">Delivery to</h2>
        <p>{a.full_name} · {a.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}</p>
        {o.customer_notes && <p className="mt-2 text-muted">Note: {o.customer_notes}</p>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/orders" className="text-sm underline">← All my orders</Link>
        {o.status === "placed" && o.payment_status !== "paid" && (
          <form action={cancelMyOrder}>
            <input type="hidden" name="id" value={o.id} />
            <button className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50">Cancel order</button>
          </form>
        )}
      </div>
    </div>
  );
}
