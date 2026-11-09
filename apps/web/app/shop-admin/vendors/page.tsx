import { rupees } from "@abh/core";
import Link from "next/link";
import { Badge, Button, Field, Input } from "@/components/admin/ui";
import { PrintButton } from "@/components/shop/BillTools";
import { Stat } from "@/components/shop/Stats";
import { addDays, addMonths, dayName, getVendorReport, monthRange, pickDay } from "@/lib/shop/reports";
import { istToday } from "@/lib/shop/server";

export default async function VendorPerformance({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; sort?: string }> }) {
  const sp = await searchParams;
  const today = istToday();
  let from = pickDay(sp.from, addDays(today, -89));
  let to = pickDay(sp.to, today);
  if (to < from) [from, to] = [to, from];
  const sort = ["profit", "items", "sell"].includes(sp.sort ?? "") ? sp.sort! : "amount";
  const all = await getVendorReport(from, to);
  // Sell-through: of the pieces we had (sold + still in stock), how many were sold.
  const rows = all
    .map((v) => ({ ...v, sell: v.items + v.stock_pieces > 0 ? v.items / (v.items + v.stock_pieces) : 0 }))
    .sort((a, b) =>
      sort === "profit" ? b.profit - a.profit : sort === "items" ? b.items - a.items : sort === "sell" ? b.sell - a.sell : b.amount - a.amount,
    );
  const totalSales = rows.reduce((a, v) => a + v.amount, 0);
  const top = Math.max(1, ...rows.map((v) => v.amount));
  const sellers = rows.filter((v) => v.items > 0);
  const best = [...sellers].sort((a, b) => b.amount - a.amount)[0];
  const fastest = [...sellers].filter((v) => v.items >= 3).sort((a, b) => b.sell - a.sell)[0];
  const thisMonth = today.slice(0, 7);
  const quick = [
    { label: "This month", from: `${thisMonth}-01`, to: today },
    { label: "Last month", ...monthRange(addMonths(thisMonth, -1)) },
    { label: "Last 3 months", from: addDays(today, -89), to: today },
    { label: "Last 12 months", from: addDays(today, -364), to: today },
  ];
  const link = (o: Record<string, string>) => `/shop-admin/vendors?${new URLSearchParams({ from, to, sort, ...o })}`;
  const verdict = (v: (typeof rows)[number]) => {
    if (!v.items) return v.stock_pieces ? <Badge tone="bad">Not selling</Badge> : null;
    if (v.sell >= 0.5) return <Badge tone="good">Selling well</Badge>;
    if (v.sell >= 0.2) return <Badge>Steady</Badge>;
    return <Badge tone="warn">Slow</Badge>;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">Vendor performance</h1>
          <p className="text-sm text-muted">Which vendors&apos; jewellery sells best, {dayName(from)} to {dayName(to)}.</p>
        </div>
        <PrintButton />
      </div>
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        {quick.map((x) => (
          <Link
            key={x.label}
            href={link({ from: x.from, to: x.to })}
            className={`rounded-full px-3 py-1 text-sm ${x.from === from && x.to === to ? "bg-maroon text-white" : "border border-cream bg-white hover:bg-cream"}`}
          >
            {x.label}
          </Link>
        ))}
        <form className="flex flex-wrap items-end gap-2">
          <Field label="From"><Input type="date" name="from" defaultValue={from} max={today} /></Field>
          <Field label="To"><Input type="date" name="to" defaultValue={to} max={today} /></Field>
          <input type="hidden" name="sort" value={sort} />
          <Button variant="secondary">Show</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales (after returns)" value={totalSales} />
        <Stat label="Vendors with sales" value={`${sellers.length} of ${rows.length}`} money={false} />
        <Stat label="Top vendor" value={best?.name ?? "–"} money={false} sub={best ? `${rupees(best.amount)} · ${best.items} pieces` : undefined} />
        <Stat label="Sells fastest" value={fastest?.name ?? "–"} money={false} sub={fastest ? `${Math.round(fastest.sell * 100)}% of its pieces sold` : undefined} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-cream bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-cream bg-cream/40 text-[11px] uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Vendor</th>
              <th className="px-3 py-2 text-left font-medium"><Link href={link({ sort: "amount" })} className="underline">Sales</Link></th>
              <th className="px-3 py-2 text-right font-medium"><Link href={link({ sort: "items" })} className="underline">Pieces sold</Link></th>
              <th className="px-3 py-2 text-right font-medium">Bills</th>
              <th className="px-3 py-2 text-right font-medium"><Link href={link({ sort: "profit" })} className="underline">Profit</Link></th>
              <th className="px-3 py-2 text-right font-medium">Margin</th>
              <th className="px-3 py-2 text-right font-medium">Returned</th>
              <th className="px-3 py-2 text-right font-medium">In stock now</th>
              <th className="px-3 py-2 text-right font-medium"><Link href={link({ sort: "sell" })} className="underline">Sold of stock</Link></th>
              <th className="px-3 py-2 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((v, i) => (
              <tr key={v.id ?? "none"}>
                <td className="px-3 py-2">
                  <span className="mr-1 text-xs text-muted">{i + 1}.</span>
                  {v.id ? <Link href={`/shop-admin/products?vendor=${v.id}`} className="font-medium underline">{v.name}</Link> : <span className="font-medium">{v.name}</span>}
                  {(v.city || v.code_no !== null) && <span className="block text-xs text-muted">{[v.city, v.code_no !== null ? `no. ${v.code_no}` : ""].filter(Boolean).join(" · ")}</span>}
                </td>
                <td className="min-w-40 px-3 py-2">
                  <div className="font-medium">{rupees(v.amount)}</div>
                  <div className="mt-1 h-1.5 rounded-full bg-cream">
                    <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.max(0, (v.amount / top) * 100)}%` }} />
                  </div>
                  {totalSales > 0 && <div className="text-[10px] text-muted">{Math.round((v.amount / totalSales) * 100)}% of sales</div>}
                </td>
                <td className="px-3 py-2 text-right">{v.items}</td>
                <td className="px-3 py-2 text-right">{v.bills}</td>
                <td className={`px-3 py-2 text-right ${v.profit < 0 ? "text-red-700" : "text-green-700"}`}>{rupees(v.profit)}</td>
                <td className="px-3 py-2 text-right">{v.amount > 0 ? `${Math.round((v.profit / v.amount) * 100)}%` : "–"}</td>
                <td className="px-3 py-2 text-right">{v.returned || "–"}</td>
                <td className="px-3 py-2 text-right">{v.stock_pieces}<span className="block text-[10px] text-muted">{rupees(v.stock_cost)} cost</span></td>
                <td className="px-3 py-2 text-right">{v.items + v.stock_pieces > 0 ? `${Math.round(v.sell * 100)}%` : "–"}</td>
                <td className="px-3 py-2">{verdict(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-muted">No vendors yet. Add them in Vendors &amp; settings.</p>}
      </div>
      <p className="text-xs text-muted">
        Sales are after the bill discount and leave out returned pieces. &quot;Sold of stock&quot; = pieces sold in these dates ÷ (sold + still in
        stock): above 50% sells well, below 20% is slow. Click a vendor to see their products.
      </p>
    </div>
  );
}
