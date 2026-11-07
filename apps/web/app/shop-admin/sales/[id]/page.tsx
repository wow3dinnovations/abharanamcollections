import { rupees } from "@abh/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/admin/ui";
import { BillTools, CancelBill } from "@/components/shop/BillTools";
import { requireAdmin } from "@/lib/admin";
import { getMasters, getStoreName, istDate } from "@/lib/shop/server";
import { cancelSale } from "../../actions";

const PAY: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };

export default async function BillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();
  const [{ data: s }, items, store, m] = await Promise.all([
    supabase.from("shop_sales").select("*, shop_locations(name)").eq("id", id).maybeSingle(),
    supabase.from("shop_sale_items").select("*").eq("sale_id", id).order("id"),
    getStoreName(),
    getMasters(),
  ]);
  if (!s) notFound();

  return (
    <div className="space-y-4">
      {/* Only the bill is printed. */}
      <style>{`@media print { body * { visibility: hidden !important; } .bill, .bill * { visibility: visible !important; } .bill { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; } }`}</style>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/shop-admin/sales" className="text-sm underline">← All bills</Link>
        <span className="flex-1" />
        <BillTools autoPrint={sp.print === "1" && s.status === "paid"} />
        <Link href="/shop-admin/pos" className="rounded border border-cream bg-white px-3 py-1.5 text-sm">New bill</Link>
        {s.status === "paid" && <CancelBill id={s.id} action={cancelSale} />}
      </div>
      <div className="bill mx-auto max-w-md rounded-xl border border-cream bg-white p-5 text-sm text-black">
        <div className="text-center">
          <p className="text-lg font-bold">{store.name}</p>
          {s.shop_locations?.name && <p>{s.shop_locations.name}</p>}
          {store.address && <p className="text-xs">{store.address}</p>}
          {store.phone && <p className="text-xs">Phone {store.phone}</p>}
        </div>
        <div className="mt-3 flex justify-between border-y border-dashed border-stone-400 py-1 text-xs">
          <span>Bill {s.number} {s.status === "cancelled" && <Badge tone="bad">Cancelled</Badge>}</span>
          <span>{istDate(s.created_at)}</span>
        </div>
        {(s.customer_name || s.customer_phone) && <p className="mt-1 text-xs">Customer: {s.customer_name} {s.customer_phone}</p>}
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="border-b border-stone-300 text-left"><th className="py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr>
          </thead>
          <tbody>
            {(items.data ?? []).map((it) => (
              <tr key={it.id}>
                <td className="py-1">{it.name}<br /><span className="text-[10px] text-stone-500">{it.sku}</span></td>
                <td className="text-right">{it.qty}</td>
                <td className="text-right">{rupees(it.price)}</td>
                <td className="text-right">{rupees(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-2 grid grid-cols-2 border-t border-dashed border-stone-400 pt-1 text-xs">
          <dt>Subtotal</dt><dd className="text-right">{rupees(s.subtotal)}</dd>
          {Number(s.discount) > 0 && <><dt>Discount{s.discount_type === "percent" ? ` (${Number(s.discount_value)}%)` : ""}</dt><dd className="text-right">− {rupees(s.discount)}</dd></>}
          <dt className="text-base font-bold">Total</dt><dd className="text-right text-base font-bold">{rupees(s.total)}</dd>
          <dt>Paid by</dt><dd className="text-right">{PAY[s.payment_method] ?? s.payment_method}</dd>
        </dl>
        {s.notes && <p className="mt-2 text-xs">{s.notes}</p>}
        {m.settings.bill_footer && <p className="mt-3 text-center text-xs">{m.settings.bill_footer}</p>}
      </div>
    </div>
  );
}
