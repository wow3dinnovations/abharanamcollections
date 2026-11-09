import { rupees } from "@abh/core";
import Link from "next/link";
import { Button, Card, Field, Input, Select, Table, Td } from "@/components/admin/ui";
import { PrintButton } from "@/components/shop/BillTools";
import { ProfitTiles, ReportTable, Section, Stat } from "@/components/shop/Stats";
import { addDays, addMonths, dayName, EXPENSE_TYPES, getBreakdown, getReport, monthName, monthRange, pickDay, sumRows } from "@/lib/shop/reports";
import { istToday } from "@/lib/shop/server";

const PAY: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; by?: string }> }) {
  const sp = await searchParams;
  const today = istToday();
  const thisMonth = today.slice(0, 7);
  let from = pickDay(sp.from, `${thisMonth}-01`);
  let to = pickDay(sp.to, today);
  if (to < from) [from, to] = [to, from];
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  const by = sp.by === "month" || days > 400 || (sp.by !== "day" && days > 62) ? "month" : "day";
  const [rows, total, bd] = await Promise.all([getReport(from, to, by), getReport(from, to, "total"), getBreakdown(from, to)]);
  const t = total[0]!;
  const lastMonth = monthRange(addMonths(thisMonth, -1));
  const quick = [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: addDays(today, -1), to: addDays(today, -1) },
    { label: "Last 7 days", from: addDays(today, -6), to: today },
    { label: "This month", from: `${thisMonth}-01`, to: today },
    { label: "Last month", ...lastMonth },
    { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
  const q = (f: string, tt: string, b?: string) => `/shop-admin/reports?from=${f}&to=${tt}${b ? `&by=${b}` : ""}`;
  const csv = `/shop-admin/reports/csv?from=${from}&to=${to}&by=${by}`;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">Profit &amp; loss</h1>
          <p className="text-sm text-muted">
            {from === to ? dayName(from, true) : `${dayName(from)} to ${dayName(to)}`}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <a href={csv} className="rounded border border-cream bg-white px-3 py-1.5 text-sm font-medium hover:bg-cream">Download (Excel / CSV)</a>
          <PrintButton />
        </div>
      </div>

      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap gap-1 text-sm">
          {quick.map((x) => (
            <Link
              key={x.label}
              href={q(x.from, x.to)}
              className={`rounded-full px-3 py-1 ${x.from === from && x.to === to ? "bg-maroon text-white" : "border border-cream bg-white hover:bg-cream"}`}
            >
              {x.label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <Field label="From"><Input type="date" name="from" defaultValue={from} max={today} /></Field>
          <Field label="To"><Input type="date" name="to" defaultValue={to} max={today} /></Field>
          <Field label="Rows">
            <Select name="by" defaultValue={by}>
              <option value="day">Day by day</option>
              <option value="month">Month by month</option>
            </Select>
          </Field>
          <Button variant="secondary">Show</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Bills" value={t.bills} money={false} />
        <Stat label="Pieces sold" value={t.items - t.returned_items} money={false} />
        <Stat label="Gross sales" value={t.gross} />
        <Stat label="Returns" value={t.returns} sub={t.returned_items ? `${t.returned_items} pieces` : undefined} />
        <Stat label={t.net_profit < 0 ? "Loss" : "Profit"} value={Math.abs(t.net_profit)} tone={t.net_profit < 0 ? "bad" : "good"} sub="after expenses" />
      </div>
      <ProfitTiles r={t} />

      <Section title={by === "day" ? "Day by day" : "Month by month"}>
        <ReportTable
          rows={rows}
          total={sumRows(rows)}
          label={(p) => (by === "day" ? dayName(p, true) : monthName(p))}
          link={(p) => (by === "day" ? `/shop-admin/sales/daily?day=${p}` : q(p < from ? from : p, monthRange(p.slice(0, 7)).to > to ? to : monthRange(p.slice(0, 7)).to, "day"))}
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By category">
          <Table head={["Category", "Pieces", "Sales", "Profit", "Margin"]}>
            {bd.categories.map((c) => (
              <tr key={c.name}>
                <Td>{c.name}</Td>
                <Td>{c.items}</Td>
                <Td>{rupees(c.amount)}</Td>
                <Td className={c.profit < 0 ? "text-red-700" : "text-green-700"}>{rupees(c.profit)}</Td>
                <Td>{c.amount > 0 ? `${Math.round((c.profit / c.amount) * 100)}%` : "–"}</Td>
              </tr>
            ))}
          </Table>
          {!bd.categories.length && <p className="text-sm text-muted">No sales.</p>}
        </Card>
        <Card title="Expenses by type">
          <Table head={["For", "Entries", "Amount"]}>
            {bd.expenses.map((e) => (
              <tr key={e.name}>
                <Td>{EXPENSE_TYPES[e.name] ?? e.name}</Td>
                <Td>{e.count}</Td>
                <Td className="text-red-700">{rupees(e.amount)}</Td>
              </tr>
            ))}
          </Table>
          {!bd.expenses.length && <p className="text-sm text-muted">No expenses. <Link href="/shop-admin/expenses" className="underline">Add one</Link></p>}
        </Card>
        <Card title="Best-selling products">
          <Table head={["Code", "Name", "Pieces", "Sales", "Profit"]}>
            {bd.products.map((p) => (
              <tr key={p.id ?? p.sku}>
                <Td><Link href={`/shop-admin?code=${encodeURIComponent(p.sku)}`} className="font-mono underline">{p.sku}</Link></Td>
                <Td>{p.name}</Td>
                <Td>{p.items}</Td>
                <Td>{rupees(p.amount)}</Td>
                <Td className={p.profit < 0 ? "text-red-700" : "text-green-700"}>{rupees(p.profit)}</Td>
              </tr>
            ))}
          </Table>
          {!bd.products.length && <p className="text-sm text-muted">No sales.</p>}
        </Card>
        <Card title="By payment">
          <Table head={["Paid by", "Bills", "Amount"]}>
            {bd.payments.map((p) => (
              <tr key={p.name}>
                <Td>{PAY[p.name] ?? p.name}</Td>
                <Td>{p.bills}</Td>
                <Td>{rupees(p.amount)}</Td>
              </tr>
            ))}
          </Table>
          {!bd.payments.length && <p className="text-sm text-muted">No sales.</p>}
          <p className="mt-3 text-xs text-muted">
            Vendor-wise sales are on <Link href={`/shop-admin/vendors?from=${from}&to=${to}`} className="underline">Vendor performance</Link>.
          </p>
        </Card>
      </div>
      <p className="text-xs text-muted">
        Cost = purchase rate of the pieces sold. Profit without expenses = net sales − cost. Profit with expenses also takes off the
        shop expenses. Stock bought is not taken off: it counts as cost when the pieces are sold. Cancelled bills are not counted;
        approved returns are taken off on the day they were approved.
      </p>
    </div>
  );
}
