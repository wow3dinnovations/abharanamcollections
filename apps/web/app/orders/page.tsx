import { awaitingPayment, orderStageLabel, PAYMENT_STATUS_LABEL, rupees, type PaymentStatus } from "@abh/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { STATUS_TONE } from "@/lib/orders";
import { createClient, getSessionProfile } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My orders", robots: { index: false } };

export default async function OrdersPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login?next=/orders");
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, number, status, payment_method, payment_status, total, created_at, order_items(name, quantity)")
    .order("created_at", { ascending: false })
    .limit(50);
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-semibold text-maroon">My orders</h1>
      <div className="gold-rule mb-6 mt-1 w-24" />
      {data?.length ? (
        <ul className="space-y-3">
          {data.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="block rounded-xl border border-cream bg-white p-4 hover:border-maroon">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{o.number}</p>
                  <span className="flex gap-1 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[awaitingPayment(o) ? "pending" : o.status]}`}>{orderStageLabel(o)}</span>
                    {o.status !== "cancelled" && !awaitingPayment(o) && <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[o.payment_status]}`}>{PAYMENT_STATUS_LABEL[o.payment_status as PaymentStatus]}</span>}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {new Date(o.created_at).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })} · {rupees(o.total)}
                </p>
                <p className="mt-1 text-sm">{o.order_items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No orders yet. <Link href="/shop" className="text-maroon underline">Start shopping</Link></p>
      )}
    </div>
  );
}
