import { rupees } from "@abh/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettings } from "@/lib/catalog";
import { loadPayOrder } from "../actions";
import { PayNow } from "./PayNow";

export const metadata: Metadata = { title: "Payment", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string; app?: string }> }) {
  const [{ id }, { t = "", app }] = await Promise.all([params, searchParams]);
  const [o, settings] = await Promise.all([loadPayOrder(id, t), getSettings()]);
  if (!o) notFound();
  const back = app ? (
    <a href="abharanam://orders" className="mt-6 inline-block rounded-full bg-maroon px-6 py-3 text-sm font-semibold text-white">Back to the app</a>
  ) : (
    <Link href={`/orders/${o.id}`} className="mt-6 inline-block rounded-full bg-maroon px-6 py-3 text-sm font-semibold text-white">See your order</Link>
  );

  return (
    <div className="mx-auto max-w-md rounded-xl border border-cream bg-white p-8 text-center">
      <p className="text-sm text-muted">Order {o.number}</p>
      {o.payment_status === "paid" ? (
        <>
          <p className="mt-2 font-display text-3xl font-semibold text-maroon">Thank you!</p>
          <p className="mt-2">We received your payment of <strong>{rupees(o.total)}</strong>. We&apos;ll pack your order and send you the tracking details.</p>
          {back}
        </>
      ) : o.status === "cancelled" ? (
        <>
          <p className="mt-2 text-xl font-semibold">This order was cancelled</p>
          <p className="mt-2 text-sm text-muted">It wasn&apos;t paid within 60 minutes, so the pieces went back on sale. Please place the order again.</p>
          <Link href="/shop" className="mt-6 inline-block text-maroon underline">Continue shopping</Link>
        </>
      ) : o.payment_method !== "razorpay" ? (
        <>
          <p className="mt-2">This order is paid by {o.payment_method === "cod" ? "cash on delivery" : "UPI to our account"}.</p>
          {back}
        </>
      ) : (
        <>
          <p className="mt-2 font-display text-3xl font-semibold text-maroon">{rupees(o.total)}</p>
          <p className="mt-1 text-sm text-muted">Pay with any UPI app, card or netbanking. Please pay within 60 minutes to keep your pieces.</p>
          <PayNow id={o.id} token={t} store={settings?.store_name ?? "Abharanam Collections"} fromApp={!!app} />
        </>
      )}
    </div>
  );
}
