import { rupees } from "@abh/core";
import Link from "next/link";
import { Badge, Button, Card, Input, Table, Td } from "@/components/admin/ui";
import { PrintButton } from "@/components/shop/BillTools";
import { ProfitTiles, ReportTable, Section, Stat } from "@/components/shop/Stats";
import { requireAdmin } from "@/lib/admin";
import { addDays, dayName, getReport, monthName, monthRange, pickDay, sumRows } from "@/lib/shop/reports";
import { istDate, istDayStart, istToday } from "@/lib/shop/server";

export default async function DailySales({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const today = istToday();
  const day = pickDay(sp.day, today);
  const month = monthRange(day.slice(0, 7));
  const end = new Date(new Date(istDayStart(day)).getTime() + 86400000).toISOString();
  const [dayRows, monthRows, bills] = await Promise.all([
    getReport(day, day, "total"),
    getReport(month.from, month.to < today ? month.to : today < month.from ? month.from : today, "day"),
    supabase
      .from("shop_sales")
      .select("id, number, customer_name, total, discount, payment_method, status, created_at, shop_sale_items(sku, name, qty, line_total, returned_qty)")
      .gte("created_at", istDayStart(day))
      .lt("created_at", end)
      .order("created_at", { ascending: false }),
  ]);
  const r = dayRows[0]!;
  const list = bills.data ?? [];
  // Pieces sold that day, added up per product code.
  const pieces = new Map<string, { sku: string; name: string; qty: number; amount: number }>();
  for (const b of list.filter((b) => b.status === "paid")) {
    for (const i of b.shop_sale_items) {
      const p = pieces.get(i.sku) ?? { sku: i.sku, name: i.name, qty: 0, amount: 0 };
      p.qty += i.qty;
      p.amount += Number(i.line_total);
      pieces.set(i.sku, p);
    }
  }
  const sold = [...pieces.values()].sort((a, b) => b.amount - a.amount);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">Daily sales</h1>
          <p className="text-sm text-muted">{dayName(day, true)}{day === today ? " · today" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
          <Link href={`/shop-admin/sales/daily?day=${addDays(day, -1)}`} className="rounded-md border border-cream bg-white px-2 py-1">← Day before</Link>
          <form className="flex gap-2">
            <Input type="date" name="day" defaultValue={day} max={today} aria-label="Day" />
            <Button variant="secondary">Show</Button>
          </form>
          {day < today && <Link href={`/shop-admin/sales/daily?day=${addDays(day, 1)}`} className="rounded-md border border-cream bg-white px-2 py-1">Next day →</Link>}
          <PrintButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bills" value={r.bills} money={false} />
        <Stat label="Pieces sold" value={r.items - r.returned_items} money={false} />
        <Stat label="Gross sales" value={r.gross} />
        <Stat label="Returns" value={r.returns} sub={r.returned_items ? `${r.returned_items} pieces back` : undefined} />
      </div>
      <ProfitTiles r={r} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={`Bills (${list.length})`}>
          <Table head={["Bill", "Time", "Customer", "Paid by", "Total"]}>
            {list.map((b) => (
              <tr key={b.id} className={b.status === "cancelled" ? "opacity-60" : ""}>
                <Td><Link href={`/shop-admin/sales/${b.id}`} className="underline">{b.number}</Link> {b.status === "cancelled" && <Badge tone="bad">Cancelled</Badge>}</Td>
                <Td className="text-xs text-muted">{istDate(b.created_at).split(", ").pop()}</Td>
                <Td>{b.customer_name || "–"}</Td>
                <Td>{b.payment_method}</Td>
                <Td>{rupees(b.total)}</Td>
              </tr>
            ))}
          </Table>
          {!list.length && <p className="text-sm text-muted">No bills on this day.</p>}
        </Card>
        <Card title="What sold">
          <Table head={["Code", "Name", "Pieces", "Amount"]}>
            {sold.map((p) => (
              <tr key={p.sku}>
                <Td><Link href={`/shop-admin?code=${encodeURIComponent(p.sku)}`} className="font-mono underline">{p.sku}</Link></Td>
                <Td>{p.name}</Td>
                <Td>{p.qty}</Td>
                <Td>{rupees(p.amount)}</Td>
              </tr>
            ))}
          </Table>
          {!sold.length && <p className="text-sm text-muted">Nothing sold.</p>}
          <p className="mt-2 text-xs text-muted">Amounts before the bill discount.</p>
        </Card>
      </div>

      <Section title={`${monthName(day)} day by day`} note="Click a day to see its bills.">
        <ReportTable
          rows={monthRows}
          total={sumRows(monthRows)}
          label={(p) => dayName(p, true)}
          link={(p) => `/shop-admin/sales/daily?day=${p}`}
        />
      </Section>
    </div>
  );
}
