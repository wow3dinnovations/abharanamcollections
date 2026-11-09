import { rupees } from "@abh/core";
import Link from "next/link";
import { Badge, Input } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin";
import { istDate } from "@/lib/shop/server";
import { decideReturn } from "../actions";

const TABS = [
  { v: "pending", label: "Waiting for approval" },
  { v: "approved", label: "Approved" },
  { v: "rejected", label: "Rejected" },
  { v: "all", label: "All" },
];

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.v === sp.status) ? sp.status! : "pending";
  const { supabase } = await requireAdmin();
  let q = supabase
    .from("shop_returns")
    .select("id, number, kind, status, amount, reason, created_at, decided_at, decision_note, location_id, shop_locations(name), shop_sales(id, number, customer_name, customer_phone, total, created_at), shop_return_items(id, sku, name, qty, price)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const rows = data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold">Returns &amp; cancellations</h1>
        <p className="text-sm text-muted">
          Start a return or cancellation from the bill (<Link href="/shop-admin/sales" className="underline">Bills</Link> → open the bill).
          The pieces go back into stock only when you approve it here.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.v}
            href={`/shop-admin/returns?status=${t.v}`}
            className={`rounded-full px-3 py-1 ${status === t.v ? "bg-maroon text-white" : "border border-cream bg-white hover:bg-cream"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.map((r) => (
        <article key={r.id} className="rounded-xl border border-cream bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <b>{r.number}</b>
            <Badge tone={r.kind === "cancel" ? "bad" : "neutral"}>{r.kind === "cancel" ? "Cancel whole bill" : "Return pieces"}</Badge>
            <Badge tone={r.status === "approved" ? "good" : r.status === "rejected" ? "bad" : "warn"}>
              {r.status === "pending" ? "Waiting" : r.status === "approved" ? "Approved" : "Rejected"}
            </Badge>
            <span className="flex-1" />
            <span className="text-xs text-muted">Asked {istDate(r.created_at)}</span>
          </div>
          <p className="mt-2 text-sm">
            Bill{" "}
            {r.shop_sales ? (
              <Link href={`/shop-admin/sales/${r.shop_sales.id}`} className="font-medium underline">{r.shop_sales.number}</Link>
            ) : "–"}
            {r.shop_sales && <> of {istDate(r.shop_sales.created_at, false)} · {r.shop_sales.customer_name || "no name"} {r.shop_sales.customer_phone} · bill total {rupees(r.shop_sales.total)}</>}
          </p>
          <ul className="mt-2 text-sm">
            {r.shop_return_items.map((i) => (
              <li key={i.id}><span className="font-mono">{i.sku}</span> {i.name} · {i.qty} × {rupees(i.price)}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            Money back to the customer: <b>{rupees(r.amount)}</b>
            {r.kind === "return" && <span className="text-muted"> · back to {r.shop_locations?.name ?? "where it was sold from"}</span>}
          </p>
          {r.reason && <p className="text-sm text-muted">Reason: {r.reason}</p>}
          {r.status !== "pending" && (
            <p className="mt-1 text-xs text-muted">{r.status === "approved" ? "Approved" : "Rejected"} {istDate(r.decided_at)}{r.decision_note ? ` · ${r.decision_note}` : ""}</p>
          )}
          {r.status === "pending" && (
            <form action={decideReturn} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={r.id} />
              <Input name="note" maxLength={300} placeholder="Note (optional)" className="w-64" />
              <button name="decision" value="approve" className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800">
                Approve · put back into stock
              </button>
              <button name="decision" value="reject" className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                Reject
              </button>
            </form>
          )}
        </article>
      ))}
      {!rows.length && <p className="text-sm text-muted">Nothing here.</p>}
    </div>
  );
}
