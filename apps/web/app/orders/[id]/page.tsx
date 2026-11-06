import { awaitingPayment, ORDER_STATUS_LABEL, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, rupees, upiLink, type OrderStatus, type PaymentMethod, type PaymentStatus } from "@abh/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
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
  const waiting = awaitingPayment(o);
  const upi = waiting && method === "upi_manual" && settings?.upi_id ? upiLink(settings.upi_id, settings.store_name, Number(o.total), o.number) : null;
  const qr = upi ? await QRCode.toString(upi, { type: "svg", margin: 1, color: { dark: "#3b0d12", light: "#ffffff" } }) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {sp.placed && !waiting && (
        <div className="rounded-xl border border-green-300 bg-green-50 p-5 text-center">
          <p className="font-display text-3xl font-semibold text-maroon">Thank you!</p>
          <p className="mt-1">Your order <strong>{o.number}</strong> is placed.{method === "cod" ? " We'll call or WhatsApp you to confirm." : " We received your payment."}</p>
        </div>
      )}
      {sp.error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{sp.error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-semibold text-maroon">Order {o.number}</h1>
        <span className="flex gap-1 text-xs">
          {waiting ? (
            <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE.pending}`}>Awaiting payment</span>
          ) : (
            <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[o.status]}`}>{ORDER_STATUS_LABEL[o.status as OrderStatus]}</span>
          )}
          {o.status !== "cancelled" && !waiting && <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[o.payment_status]}`}>{PAYMENT_STATUS_LABEL[o.payment_status as PaymentStatus]}</span>}
        </span>
      </div>

      {o.status !== "cancelled" && !waiting && (
        <ol className="grid grid-cols-5 gap-1 text-center text-[11px]">
          {STEPS.map((s, i) => (
            <li key={s} className={`rounded py-1 ${i <= step ? "bg-maroon text-white" : "bg-cream text-muted"}`}>{ORDER_STATUS_LABEL[s]}</li>
          ))}
        </ol>
      )}
      {o.tracking && <p className="rounded-xl border border-cream bg-white p-4 text-sm"><strong>Tracking:</strong> {o.tracking}</p>}

      {waiting && method === "razorpay" && (
        <div className="rounded-xl border border-maroon/40 bg-white p-5 text-center">
          <p className="font-display text-2xl font-semibold text-maroon">Pay to place your order</p>
          <p className="mt-1 text-sm text-muted">Your pieces are kept for 60 minutes. The order is placed as soon as the payment goes through.</p>
          <Link href={`/pay/${o.id}?t=${o.pay_token}`} className="mt-4 inline-block rounded-full bg-maroon px-8 py-3 font-semibold text-white">Pay {rupees(o.total)} now</Link>
        </div>
      )}
      {upi && settings?.upi_id && (
        <div className="rounded-xl border border-maroon/40 bg-white p-5 text-center">
          <p className="font-display text-2xl font-semibold text-maroon">Pay {rupees(o.total)} to place your order</p>
          <a href={upi} className="mt-4 inline-block rounded-full bg-maroon px-8 py-3 font-semibold text-white md:hidden">Pay with a UPI app</a>
          {qr && (
            <div className="mt-4 hidden md:block">
              <p className="text-sm">Scan with any UPI app (Google Pay, PhonePe, Paytm…)</p>
              <div className="mx-auto mt-2 w-52" dangerouslySetInnerHTML={{ __html: qr }} />
            </div>
          )}
          <p className="mt-4 text-sm">
            Or pay to UPI ID <strong className="select-all">{settings.upi_id}</strong> with note <strong>{o.number}</strong>.
          </p>
          <p className="mt-2 text-xs text-muted">We check the payment and confirm your order, usually within a few hours. Your pieces are kept for you.</p>
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
