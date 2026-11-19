import { rupees } from "@abh/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Button, Card, Field, Input, Table, Td } from "@/components/admin/ui";
import { PrintButton } from "@/components/shop/BillTools";
import { BarList, Change, Columns } from "@/components/shop/Charts";
import { money, ProfitTiles, Section, Stat } from "@/components/shop/Stats";
import { requireAdmin } from "@/lib/admin";
import { getAnalytics, type AnalyticsData } from "@/lib/shop/analytics";
import type { Group, VendorGroup } from "@/lib/shop/analytics-calc";
import { addDays, addMonths, dayName, EXPENSE_TYPES, getBreakdown, getReport, monthName, monthRange, pickDay, type ReportRow } from "@/lib/shop/reports";
import { istDate, istDayStart, istToday } from "@/lib/shop/server";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "sales", label: "Sales" },
  { id: "products", label: "Products & categories" },
  { id: "stock", label: "Stock" },
  { id: "customers", label: "Customers" },
  { id: "vendors", label: "Vendors" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const PAY: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

type SP = { view?: string; from?: string; to?: string; vendor?: string; sort?: string };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const today = istToday();
  let from = pickDay(sp.from, addDays(today, -89));
  let to = pickDay(sp.to, today);
  if (to < from) [from, to] = [to, from];
  const view: View = VIEWS.some((v) => v.id === sp.view) ? (sp.view as View) : sp.vendor ? "vendors" : "overview";
  const vendor = view === "vendors" && sp.vendor && (sp.vendor === "none" || /^[0-9a-f-]{36}$/i.test(sp.vendor)) ? sp.vendor : undefined;
  const sort = ["profit", "items", "sell", "days", "stock", "old"].includes(sp.sort ?? "") ? sp.sort! : "amount";

  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
  const by = days > 62 ? "month" : "day";
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -days);

  const { supabase } = await requireAdmin();
  const [a, trend, total, prev, bd, orders, enquiries] = await Promise.all([
    getAnalytics(from, to, vendor),
    getReport(from, to, by),
    getReport(from, to, "total"),
    getReport(prevFrom, prevTo, "total"),
    getBreakdown(from, to),
    supabase.from("orders").select("status, total").gte("created_at", istDayStart(from)).lt("created_at", istDayStart(addDays(to, 1))).limit(5000),
    supabase.from("enquiries").select("id", { count: "exact", head: true }).gte("created_at", istDayStart(from)).lt("created_at", istDayStart(addDays(to, 1))),
  ]);
  const t = total[0]!;
  const p = prev[0]!;

  const thisMonth = today.slice(0, 7);
  const quick = [
    { label: "This month", from: `${thisMonth}-01`, to: today },
    { label: "Last month", ...monthRange(addMonths(thisMonth, -1)) },
    { label: "Last 3 months", from: addDays(today, -89), to: today },
    { label: "Last 12 months", from: addDays(today, -364), to: today },
    { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
  const link = (o: Partial<SP>) => {
    const q: Record<string, string> = { view, from, to };
    if (vendor) q.vendor = vendor;
    if (view === "vendors" && sort !== "amount") q.sort = sort;
    for (const [k, v] of Object.entries(o)) {
      if (v === undefined || v === "") delete q[k];
      else q[k] = v;
    }
    return `/shop-admin/analytics?${new URLSearchParams(q)}`;
  };
  const vendorName = vendor ? (a.vendors.find((v) => (v.id ?? "none") === vendor)?.name ?? a.vendorList.find((v) => v.id === vendor)?.name ?? "Vendor") : "";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted">
            {vendor ? <>{vendorName} · </> : null}
            {from === to ? dayName(from, true) : `${dayName(from)} to ${dayName(to)}`} · {plural(days + 1, "day")}
          </p>
        </div>
        <PrintButton />
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-cream print:hidden">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={link({ view: v.id, vendor: undefined, sort: undefined })}
            className={`-mb-px rounded-t-md border px-3 py-2 text-sm font-medium ${
              view === v.id ? "border-cream border-b-ivory bg-ivory text-maroon" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

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
          <input type="hidden" name="view" value={view} />
          {vendor && <input type="hidden" name="vendor" value={vendor} />}
          <Field label="From"><Input type="date" name="from" defaultValue={from} max={today} /></Field>
          <Field label="To"><Input type="date" name="to" defaultValue={to} max={today} /></Field>
          <Button variant="secondary">Show</Button>
        </form>
      </div>
      {a.capped && <p className="text-sm text-amber-800">Very many bills in these dates: only the first 50,000 bill lines are counted. Choose fewer dates for exact figures.</p>}

      {view === "overview" && <Overview a={a} t={t} p={p} trend={trend} by={by} bd={bd} orders={orders.data ?? []} enquiries={enquiries.count ?? 0} link={link} />}
      {view === "sales" && <Sales a={a} t={t} p={p} trend={trend} by={by} bd={bd} dayCount={days + 1} />}
      {view === "products" && <Products a={a} />}
      {view === "stock" && <Stock a={a} link={link} />}
      {view === "customers" && <Customers a={a} />}
      {view === "vendors" && (vendor ? <VendorDetail a={a} id={vendor} name={vendorName} link={link} /> : <Vendors a={a} sort={sort} link={link} />)}
    </div>
  );
}

type LinkFn = (o: Partial<SP>) => string;

// ======================================================================================== overview
function Overview({ a, t, p, trend, by, bd, orders, enquiries, link }: {
  a: AnalyticsData; t: ReportRow; p: ReportRow; trend: ReportRow[]; by: "day" | "month"; bd: Awaited<ReturnType<typeof getBreakdown>>;
  orders: { status: string; total: number }[]; enquiries: number; link: LinkFn;
}) {
  const pieces = t.items - t.returned_items;
  const avgBill = t.bills ? t.net_sales / t.bills : 0;
  const prevAvg = p.bills ? p.net_sales / p.bills : 0;
  const liveOrders = orders.filter((o) => o.status !== "cancelled");
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Net sales" value={t.net_sales} sub={<Change now={t.net_sales} before={p.net_sales} />} />
        <Stat label="Profit with expenses" value={t.net_profit} tone="auto" sub={<Change now={t.net_profit} before={p.net_profit} />} />
        <Stat label="Bills" value={t.bills} money={false} sub={<Change now={t.bills} before={p.bills} />} />
        <Stat label="Average bill" value={Math.round(avgBill)} sub={<Change now={avgBill} before={prevAvg} />} />
        <Stat label="Pieces sold" value={pieces} money={false} sub={t.bills ? `${(pieces / t.bills).toFixed(1)} per bill` : undefined} />
        <Stat label="Profit margin" value={pct(t.gross_profit, t.net_sales)} money={false} sub="before expenses" />
        <Stat label="Discount given" value={t.discount} sub={`${pct(t.discount, t.gross)} of gross sales`} />
        <Stat label="Returns" value={t.returns} sub={t.returned_items ? `${plural(t.returned_items, "piece")} · ${pct(t.returns, t.sales)} of sales` : "none"} />
      </div>

      <Section title="Profit" note="Cost = purchase rate of pieces sold. Stock bought is not an expense; it becomes cost when sold.">
        <ProfitTiles r={t} />
      </Section>

      <Card title={by === "day" ? "Net sales, day by day" : "Net sales, month by month"}>
        <TrendColumns rows={trend} by={by} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Top categories">
          <BarList rows={a.categories.filter((c) => c.amount > 0).slice(0, 8).map((c) => ({ key: c.key, label: c.name, value: c.amount, display: rupees(c.amount), sub: `${c.items} pcs · ${pct(c.profit, c.amount)} margin` }))} />
        </Card>
        <Card title="Top vendors">
          <BarList
            rows={a.vendors.filter((v) => v.amount > 0).slice(0, 8).map((v) => ({
              key: v.key, label: <Link href={link({ view: "vendors", vendor: v.id ?? "none" })} className="underline">{v.name}</Link>,
              value: v.amount, display: rupees(v.amount), sub: `${v.items} pcs · ${pct(v.profit, v.amount)} margin`,
            }))}
          />
        </Card>
        <Card title="Best-selling products">
          <BarList
            rows={a.topProducts.slice(0, 8).map((x) => ({
              key: x.id ?? x.sku, label: <Link href={`/shop-admin?code=${encodeURIComponent(x.sku)}`} className="font-mono underline" title={x.name}>{x.sku}</Link>,
              value: x.amount, display: rupees(x.amount), sub: `${x.items} pcs`, title: x.name,
            }))}
          />
        </Card>
        <Card title="How customers paid">
          <BarList rows={bd.payments.map((x) => ({ key: x.name, label: PAY[x.name] ?? x.name, value: x.amount, display: rupees(x.amount), sub: plural(x.bills, "bill"), tone: "maroon" as const }))} />
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Stock at purchase rate" value={a.stock.cost} sub={`${a.stock.pieces} pieces · ${rupees(a.stock.value)} at selling price`} />
        <Stat label="Old stock (6+ months)" value={a.stock.oldCost} tone={a.stock.oldCost > 0 ? "bad" : "plain"} sub={`${a.stock.oldPieces} pieces · ${pct(a.stock.oldPieces, a.stock.pieces)} of stock`} />
        <Stat label="Customers who bought" value={a.customerStats.buyers} money={false} sub={`${a.customerStats.newBuyers} new · ${a.customerStats.returning} returning`} />
        <Stat label="Online" value={liveOrders.reduce((s, o) => s + Number(o.total), 0)} sub={`${plural(liveOrders.length, "order")} · ${plural(enquiries, "enquiry")}`.replace("enquirys", "enquiries")} />
      </div>
    </div>
  );
}

function TrendColumns({ rows, by }: { rows: ReportRow[]; by: "day" | "month" }) {
  return (
    <Columns
      labelEvery={by === "month" ? 1 : Math.max(1, Math.ceil(rows.length / 10))}
      points={rows.map((r) => ({
        key: r.period,
        label: by === "month" ? monthName(r.period).slice(0, 3) : r.period.slice(8, 10),
        value: Math.max(0, r.net_sales),
        title: `${by === "month" ? monthName(r.period) : dayName(r.period, true)}: ${money(r.net_sales)} sales · ${r.bills} bills · ${money(r.net_profit)} profit with expenses`,
      }))}
    />
  );
}

// ======================================================================================== sales
function Sales({ a, t, p, trend, by, bd, dayCount }: { a: AnalyticsData; t: ReportRow; p: ReportRow; trend: ReportRow[]; by: "day" | "month"; bd: Awaited<ReturnType<typeof getBreakdown>>; dayCount: number }) {
  const busiestDay = [...a.weekday].sort((x, y) => y.amount - x.amount)[0];
  const openHours = a.hours.filter((h) => h.bills > 0);
  const firstHour = openHours[0]?.hour ?? 10;
  const lastHour = openHours.at(-1)?.hour ?? 20;
  const hourRows = a.hours.slice(Math.min(firstHour, 9), Math.max(lastHour, 20) + 1);
  const busiestHour = [...a.hours].sort((x, y) => y.bills - x.bills)[0];
  const best = [...trend].sort((x, y) => y.net_sales - x.net_sales)[0];
  const h12 = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Gross sales" value={t.gross} sub={<Change now={t.gross} before={p.gross} />} />
        <Stat label="Net sales" value={t.net_sales} sub={<Change now={t.net_sales} before={p.net_sales} />} />
        <Stat label={by === "day" ? "Best day" : "Best month"} value={best && best.net_sales > 0 ? (by === "day" ? dayName(best.period) : monthName(best.period)) : "–"} money={false} sub={best && best.net_sales > 0 ? rupees(best.net_sales) : undefined} />
        <Stat label="Average per day" value={Math.round(t.net_sales / dayCount)} sub={`over ${plural(dayCount, "day")}`} />
      </div>

      <Card title={by === "day" ? "Day by day" : "Month by month"}>
        <TrendColumns rows={trend} by={by} />
        <div className="mt-4 overflow-x-auto">
          <Table head={["", "Bills", "Pieces", "Net sales", "Profit w/o exp.", "Expenses", "Profit with exp."]}>
            {trend.filter((r) => r.bills || r.expenses || r.returns).map((r) => (
              <tr key={r.period}>
                <Td className="whitespace-nowrap">{by === "day" ? <Link className="underline" href={`/shop-admin/sales/daily?day=${r.period}`}>{dayName(r.period, true)}</Link> : monthName(r.period)}</Td>
                <Td>{r.bills}</Td>
                <Td>{r.items - r.returned_items}</Td>
                <Td>{money(r.net_sales)}</Td>
                <Td className={r.gross_profit < 0 ? "text-red-700" : "text-green-700"}>{money(r.gross_profit)}</Td>
                <Td className="text-red-700">{r.expenses ? money(r.expenses) : "–"}</Td>
                <Td className={r.net_profit < 0 ? "text-red-700" : "text-green-700"}>{money(r.net_profit)}</Td>
              </tr>
            ))}
          </Table>
        </div>
        <p className="mt-2 text-xs text-muted">Full figures and a CSV download are on <Link className="underline" href="/shop-admin/reports">Profit &amp; loss</Link>.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Busiest days of the week">
          <Columns height={120} points={[1, 2, 3, 4, 5, 6, 0].map((d) => { const w = a.weekday[d]!; return { key: w.name, label: w.name, value: w.amount, title: `${w.name}: ${rupees(w.amount)} · ${plural(w.bills, "bill")}` }; })} />
          {busiestDay && busiestDay.amount > 0 && <p className="mt-2 text-xs text-muted">Most sales on <b>{busiestDay.name}</b> ({rupees(busiestDay.amount)}).</p>}
        </Card>
        <Card title="Busiest hours">
          <Columns height={120} labelEvery={2} points={hourRows.map((h) => ({ key: String(h.hour), label: h12(h.hour), value: h.bills, title: `${h12(h.hour)}–${h12(h.hour + 1)}: ${plural(h.bills, "bill")} · ${rupees(h.amount)}` }))} />
          {busiestHour && busiestHour.bills > 0 && <p className="mt-2 text-xs text-muted">Most bills between <b>{h12(busiestHour.hour)} and {h12(busiestHour.hour + 1)}</b>.</p>}
        </Card>
        <Card title="Bill sizes">
          <BarList rows={a.billBands.map((b) => ({ key: b.label, label: b.label, value: b.bills, display: plural(b.bills, "bill"), sub: rupees(b.amount) }))} />
        </Card>
        <Card title="How customers paid">
          <BarList rows={bd.payments.map((x) => ({ key: x.name, label: PAY[x.name] ?? x.name, value: x.amount, display: rupees(x.amount), sub: `${plural(x.bills, "bill")} · ${pct(x.amount, t.sales)}`, tone: "maroon" as const }))} />
        </Card>
        <Card title="Expenses by type">
          <BarList empty="No expenses in these dates." rows={bd.expenses.map((e) => ({ key: e.name, label: EXPENSE_TYPES[e.name] ?? e.name, value: e.amount, display: rupees(e.amount), sub: plural(e.count, "entry").replace("entrys", "entries"), tone: "red" as const }))} />
          <p className="mt-3 text-xs text-muted">Expenses are {pct(t.expenses, t.net_sales)} of net sales.</p>
        </Card>
        <Card title="Discounts and returns">
          <Table head={["", "This period", "Before"]}>
            <tr><Td>Discount given</Td><Td>{rupees(t.discount)} ({pct(t.discount, t.gross)})</Td><Td className="text-muted">{rupees(p.discount)}</Td></tr>
            <tr><Td>Returns</Td><Td>{rupees(t.returns)} · {t.returned_items} pcs</Td><Td className="text-muted">{rupees(p.returns)}</Td></tr>
            <tr><Td>Stock bought</Td><Td>{rupees(t.purchases)}</Td><Td className="text-muted">{rupees(p.purchases)}</Td></tr>
          </Table>
          <p className="mt-2 text-xs text-muted">&quot;Before&quot; = the same number of days just before these dates.</p>
        </Card>
      </div>
    </div>
  );
}

// ======================================================================================== products
function GroupTable({ rows, first, withStock = true }: { rows: Group[]; first: string; withStock?: boolean }) {
  return (
    <Table head={[first, "Sales", "Pieces", "Profit", "Margin", ...(withStock ? ["In stock", "Sold of stock"] : [])]}>
      {rows.map((c) => (
        <tr key={c.key}>
          <Td>{c.name}</Td>
          <Td>{rupees(c.amount)}</Td>
          <Td>{c.items}</Td>
          <Td className={c.profit < 0 ? "text-red-700" : "text-green-700"}>{rupees(c.profit)}</Td>
          <Td>{pct(c.profit, c.amount)}</Td>
          {withStock && <Td>{c.stockPieces}<span className="block text-[10px] text-muted">{rupees(c.stockCost)} cost</span></Td>}
          {withStock && <Td>{c.items + c.stockPieces ? pct(c.items, c.items + c.stockPieces) : "–"}</Td>}
        </tr>
      ))}
    </Table>
  );
}

function Products({ a }: { a: AnalyticsData }) {
  const names = new Map(a.vendorList.map((v) => [v.id, v.name]));
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Designs sold" value={a.totals.designs} money={false} sub={`${a.totals.items} pieces`} />
        <Stat label="Categories selling" value={`${a.categories.filter((c) => c.items > 0).length} of ${a.categories.length}`} money={false} />
        <Stat label="Avg days to sell" value={a.totals.daysToSell ?? "–"} money={false} sub="from purchase to sale" />
        <Stat label="Designs not sold" value={a.slow.length} money={false} sub="in stock, no sale in these dates" />
      </div>
      <Card title="By category"><GroupTable rows={a.categories} first="Category" /></Card>
      <Card title="By price">
        <GroupTable rows={a.priceBands} first="Selling price" />
        <p className="mt-2 text-xs text-muted">Which price ranges sell, compared with what is in stock.</p>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Best sellers by sales">
          <ProductTable rows={a.topProducts.slice(0, 15)} names={names} />
        </Card>
        <Card title="Most profitable">
          <ProductTable rows={a.topProfit} names={names} />
        </Card>
      </div>
      <Card title="Most pieces sold">
        <ProductTable rows={a.topPieces} names={names} />
      </Card>
      <Card title="In stock but not selling (oldest first)">
        <SlowTable rows={a.slow.slice(0, 30)} names={names} />
      </Card>
    </div>
  );
}

function ProductTable({ rows, names }: { rows: AnalyticsData["topProducts"]; names?: Map<string, string> }) {
  if (!rows.length) return <p className="text-sm text-muted">No sales in these dates.</p>;
  return (
    <Table head={["Code", "Name", ...(names ? ["Vendor"] : []), "Pieces", "Sales", "Profit", "Left"]}>
      {rows.map((x) => (
        <tr key={x.id ?? x.sku}>
          <Td><Link href={`/shop-admin?code=${encodeURIComponent(x.sku)}`} className="font-mono underline">{x.sku}</Link></Td>
          <Td>{x.name}<span className="block text-[10px] text-muted">{x.category}</span></Td>
          {names && <Td className="text-xs">{x.vendor_id ? names.get(x.vendor_id) ?? "–" : "–"}</Td>}
          <Td>{x.items}</Td>
          <Td>{rupees(x.amount)}</Td>
          <Td className={x.profit < 0 ? "text-red-700" : "text-green-700"}>{rupees(x.profit)}</Td>
          <Td>{x.stock > 0 ? x.stock : <Badge tone="warn">0</Badge>}</Td>
        </tr>
      ))}
    </Table>
  );
}

function SlowTable({ rows, names }: { rows: AnalyticsData["slow"]; names?: Map<string, string> }) {
  if (!rows.length) return <p className="text-sm text-muted">Every design in stock sold at least once in these dates.</p>;
  return (
    <Table head={["Code", "Name", ...(names ? ["Vendor"] : []), "Pieces", "At purchase rate", "In shop for"]}>
      {rows.map((x) => (
        <tr key={x.id}>
          <Td><Link href={`/shop-admin?code=${encodeURIComponent(x.sku)}`} className="font-mono underline">{x.sku}</Link></Td>
          <Td>{x.name}<span className="block text-[10px] text-muted">{x.category}</span></Td>
          {names && <Td className="text-xs">{x.vendor_id ? names.get(x.vendor_id) ?? "–" : "–"}</Td>}
          <Td>{x.stock}</Td>
          <Td>{rupees(x.cost)}</Td>
          <Td>{x.days > 365 ? <Badge tone="bad">{x.days} days</Badge> : x.days > 180 ? <Badge tone="warn">{x.days} days</Badge> : `${x.days} days`}</Td>
        </tr>
      ))}
    </Table>
  );
}

// ======================================================================================== stock
function AgeTable({ a }: { a: AnalyticsData }) {
  const from = ["", "30", "90", "180", "365"];
  return (
    <Table head={["How old", "Products", "Pieces", "At purchase rate", "At selling price"]}>
      {a.ages.map((r, i) => (
        <tr key={r.label}>
          <Td><Link className="underline" href={`/shop-admin/stock?sort=age${from[i] ? `&age=${from[i]}` : ""}`}>{r.label}</Link></Td>
          <Td>{r.products}</Td>
          <Td>{r.pieces}</Td>
          <Td>{rupees(r.cost)}</Td>
          <Td>{rupees(r.value)}</Td>
        </tr>
      ))}
    </Table>
  );
}

function Stock({ a, link }: { a: AnalyticsData; link: LinkFn }) {
  const names = new Map(a.vendorList.map((v) => [v.id, v.name]));
  const byOld = [...a.vendors].filter((v) => v.oldPieces > 0).sort((x, y) => y.oldCost - x.oldCost);
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Products in stock" value={a.stock.products} money={false} sub={`${a.stock.pieces} pieces`} />
        <Stat label="At purchase rate" value={a.stock.cost} />
        <Stat label="At selling price" value={a.stock.value} sub={`${rupees(a.stock.value - a.stock.cost)} profit if all sold`} />
        <Stat label="Old stock (6+ months)" value={a.stock.oldCost} tone={a.stock.oldCost > 0 ? "bad" : "plain"} sub={`${a.stock.oldPieces} pieces`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Stock age">
          <AgeTable a={a} />
          <p className="mt-2 text-xs text-muted">By purchase date (or the day the product was added).</p>
        </Card>
        <Card title="Stock by location">
          <BarList empty="No stock." rows={a.locations.map((l) => ({ key: l.name, label: l.name, value: l.pieces, display: `${l.pieces} pcs`, sub: `${rupees(l.cost)} cost` }))} />
        </Card>
        <Card title="Stock by category">
          <BarList empty="No stock." rows={[...a.categories].filter((c) => c.stockPieces > 0).sort((x, y) => y.stockCost - x.stockCost).map((c) => ({ key: c.key, label: c.name, value: c.stockCost, display: rupees(c.stockCost), sub: `${c.stockPieces} pcs · ${c.oldPieces} old` }))} />
        </Card>
        <Card title="Old stock by vendor">
          <BarList
            empty="No stock older than 6 months."
            rows={byOld.map((v) => ({ key: v.key, label: <Link className="underline" href={link({ view: "vendors", vendor: v.id ?? "none" })}>{v.name}</Link>, value: v.oldCost, display: rupees(v.oldCost), sub: `${v.oldPieces} of ${v.stockPieces} pcs`, tone: "red" as const }))}
          />
        </Card>
      </div>
      <Card title="Oldest unsold designs">
        <SlowTable rows={a.slow.slice(0, 30)} names={names} />
      </Card>
    </div>
  );
}

// ======================================================================================== customers
function Customers({ a }: { a: AnalyticsData }) {
  const c = a.customerStats;
  const known = c.newAmount + c.returningAmount;
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Customers who bought" value={c.buyers} money={false} sub={`of ${a.customerCount} saved customers`} />
        <Stat label="New customers" value={c.newBuyers} money={false} sub={`${rupees(c.newAmount)} spent`} />
        <Stat label="Returning customers" value={c.returning} money={false} sub={`${rupees(c.returningAmount)} spent`} />
        <Stat label="Came back in these dates" value={c.repeat} money={false} sub={`${pct(c.repeat, c.buyers)} bought more than once`} />
        <Stat label="Average spend" value={c.buyers ? Math.round(known / c.buyers) : 0} sub="per customer" />
        <Stat label="Bills without a phone" value={c.walkInBills} money={false} sub={`${rupees(c.walkInAmount)} · ${pct(c.walkInBills, a.billCount)} of bills`} />
      </div>
      <Card title="Top customers">
        {a.customers.length ? (
          <Table head={["", "Customer", "Phone", "Bills", "Pieces", "Spent", "Last bill"]}>
            {a.customers.slice(0, 30).map((x, i) => (
              <tr key={x.key}>
                <Td className="text-xs text-muted">{i + 1}.</Td>
                <Td>{x.name || "–"}</Td>
                <Td className="font-mono text-xs">{x.phone || "–"}</Td>
                <Td>{x.bills}</Td>
                <Td>{x.items}</Td>
                <Td className="font-medium">{rupees(x.amount)}</Td>
                <Td className="text-xs text-muted">{istDate(x.last, false)}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-sm text-muted">No bills with a customer phone number in these dates.</p>
        )}
        <p className="mt-2 text-xs text-muted">New = first bill in these dates. Customers are matched by phone number on the bill.</p>
      </Card>
    </div>
  );
}

// ======================================================================================== vendors
function verdict(v: Group) {
  if (!v.items) return v.stockPieces ? <Badge tone="bad">Not selling</Badge> : null;
  if (v.sellThrough >= 0.5) return <Badge tone="good">Selling well</Badge>;
  if (v.sellThrough >= 0.2) return <Badge>Steady</Badge>;
  return <Badge tone="warn">Slow</Badge>;
}

function Vendors({ a, sort, link }: { a: AnalyticsData; sort: string; link: LinkFn }) {
  const val = (v: VendorGroup) =>
    sort === "profit" ? v.profit : sort === "items" ? v.items : sort === "sell" ? v.sellThrough : sort === "days" ? -(v.daysToSell ?? 1e9) : sort === "stock" ? v.stockCost : sort === "old" ? v.oldCost : v.amount;
  const rows = [...a.vendors].sort((x, y) => val(y) - val(x));
  const totalSales = rows.reduce((s, v) => s + v.amount, 0);
  const top = Math.max(1, ...rows.map((v) => v.amount));
  const sellers = rows.filter((v) => v.items > 0);
  // The highlights name real vendors only (not "No vendor").
  const named = sellers.filter((v) => v.id);
  const best = [...named].sort((x, y) => y.amount - x.amount)[0];
  const fastest = named.filter((v) => v.items >= 3).sort((x, y) => y.sellThrough - x.sellThrough)[0];
  const quickest = named.filter((v) => v.items >= 3 && v.daysToSell !== null).sort((x, y) => x.daysToSell! - y.daysToSell!)[0];
  const margin = named.filter((v) => v.items >= 3).sort((x, y) => y.profit / y.amount - x.profit / x.amount)[0];
  const sortLink = (s: string, label: string) => <Link href={link({ sort: s === "amount" ? undefined : s })} className={`underline ${sort === s ? "text-maroon" : ""}`}>{label}</Link>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales (after returns)" value={totalSales} sub={`${sellers.length} of ${rows.length} vendors sold`} />
        <Stat label="Top vendor" value={best?.name ?? "–"} money={false} sub={best ? `${rupees(best.amount)} · ${pct(best.amount, totalSales)} of sales` : undefined} />
        <Stat label="Sells fastest" value={fastest?.name ?? "–"} money={false} sub={fastest ? `${Math.round(fastest.sellThrough * 100)}% of its pieces sold` : undefined} />
        <Stat label="Best margin" value={margin?.name ?? "–"} money={false} sub={margin ? `${pct(margin.profit, margin.amount)} profit on sales` : undefined} />
        <Stat label="Quickest to sell" value={quickest?.name ?? "–"} money={false} sub={quickest ? `${quickest.daysToSell} days from purchase, on average` : undefined} />
        <Stat label="Vendor stock" value={a.stock.cost} sub={`${a.stock.pieces} pieces at purchase rate`} />
        <Stat label="Old vendor stock" value={a.stock.oldCost} tone={a.stock.oldCost > 0 ? "bad" : "plain"} sub={`${a.stock.oldPieces} pieces over 6 months`} />
        <Stat label="Returned pieces" value={a.totals.returned} money={false} sub={`${pct(a.totals.returned, a.totals.items + a.totals.returned)} of pieces sold`} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-cream bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-cream bg-cream/40 text-[11px] uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Vendor</th>
              <th className="px-3 py-2 text-left font-medium">{sortLink("amount", "Sales")}</th>
              <th className="px-3 py-2 text-right font-medium">{sortLink("items", "Pieces sold")}</th>
              <th className="px-3 py-2 text-right font-medium">Bills</th>
              <th className="px-3 py-2 text-right font-medium">{sortLink("profit", "Profit")}</th>
              <th className="px-3 py-2 text-right font-medium">Margin</th>
              <th className="px-3 py-2 text-right font-medium">Returned</th>
              <th className="px-3 py-2 text-right font-medium">{sortLink("days", "Days to sell")}</th>
              <th className="px-3 py-2 text-right font-medium">{sortLink("stock", "In stock")}</th>
              <th className="px-3 py-2 text-right font-medium">{sortLink("old", "6+ months old")}</th>
              <th className="px-3 py-2 text-right font-medium">{sortLink("sell", "Sold of stock")}</th>
              <th className="px-3 py-2 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((v, i) => (
              <tr key={v.key}>
                <td className="px-3 py-2">
                  <span className="mr-1 text-xs text-muted">{i + 1}.</span>
                  <Link href={link({ vendor: v.id ?? "none", sort: undefined })} className="font-medium underline">{v.name}</Link>
                  {(v.city || v.code_no !== null) && <span className="block text-xs text-muted">{[v.city, v.code_no !== null ? `no. ${v.code_no}` : ""].filter(Boolean).join(" · ")}</span>}
                </td>
                <td className="min-w-40 px-3 py-2">
                  <div className="font-medium">{rupees(v.amount)}</div>
                  <div className="mt-1 h-1.5 rounded-full bg-cream"><div className="h-1.5 rounded-full bg-gold" style={{ width: `${(Math.max(0, v.amount) / top) * 100}%` }} /></div>
                  {totalSales > 0 && <div className="text-[10px] text-muted">{pct(v.amount, totalSales)} of sales</div>}
                </td>
                <td className="px-3 py-2 text-right">{v.items}<span className="block text-[10px] text-muted">{plural(v.designs, "design")}</span></td>
                <td className="px-3 py-2 text-right">{v.bills}</td>
                <td className={`px-3 py-2 text-right ${v.profit < 0 ? "text-red-700" : "text-green-700"}`}>{rupees(v.profit)}</td>
                <td className="px-3 py-2 text-right">{pct(v.profit, v.amount)}</td>
                <td className="px-3 py-2 text-right">{v.returned || "–"}</td>
                <td className="px-3 py-2 text-right">{v.daysToSell ?? "–"}</td>
                <td className="px-3 py-2 text-right">{v.stockPieces}<span className="block text-[10px] text-muted">{rupees(v.stockCost)} cost</span></td>
                <td className="px-3 py-2 text-right">{v.oldPieces ? <span className="text-red-700">{v.oldPieces}<span className="block text-[10px]">{rupees(v.oldCost)}</span></span> : "–"}</td>
                <td className="px-3 py-2 text-right">{v.items + v.stockPieces > 0 ? `${Math.round(v.sellThrough * 100)}%` : "–"}</td>
                <td className="whitespace-nowrap px-3 py-2">{verdict(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-4 text-sm text-muted">No vendors yet. Add them in Vendors &amp; settings.</p>}
      </div>
      <p className="text-xs text-muted">
        Sales are after the bill discount and leave out returned pieces. &quot;Days to sell&quot; = average days from purchase date to sale.
        &quot;Sold of stock&quot; = pieces sold in these dates ÷ (sold + still in stock): above 50% sells well, below 20% is slow. Click a
        vendor for their full analytics.
      </p>
    </div>
  );
}

function VendorDetail({ a, id, name, link }: { a: AnalyticsData; id: string; name: string; link: LinkFn }) {
  const v = a.vendors.find((x) => (x.id ?? "none") === id);
  const info = a.vendorList.find((x) => x.id === id);
  const t = a.totals;
  const sellThrough = t.items + a.stock.pieces > 0 ? t.items / (t.items + a.stock.pieces) : 0;
  const g: Group = v ?? { key: id, name, ...t, stockProducts: a.stock.products, stockPieces: a.stock.pieces, stockCost: a.stock.cost, stockValue: a.stock.value, oldPieces: a.stock.oldPieces, oldCost: a.stock.oldCost, sellThrough };
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={link({ vendor: undefined })} className="text-sm underline print:hidden">← All vendors</Link>
          <h2 className="font-display text-3xl font-semibold">{name} {verdict(g)}</h2>
          {info && (info.city || info.code_no !== null) && <p className="text-sm text-muted">{[info.city, info.code_no !== null ? `vendor no. ${info.code_no}` : ""].filter(Boolean).join(" · ")}</p>}
        </div>
        {id !== "none" && <Link href={`/shop-admin/products?vendor=${id}`} className="rounded-md border border-cream bg-white px-3 py-1.5 text-sm font-medium print:hidden">Their products →</Link>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales (after returns)" value={t.amount} sub={`${plural(t.bills, "bill")}`} />
        <Stat label="Profit" value={t.profit} tone="auto" sub={`${pct(t.profit, t.amount)} margin`} />
        <Stat label="Pieces sold" value={t.items} money={false} sub={`${plural(t.designs, "design")} · ${t.returned} returned`} />
        <Stat label="Days to sell" value={t.daysToSell ?? "–"} money={false} sub="average, purchase to sale" />
        <Stat label="In stock" value={a.stock.cost} sub={`${a.stock.pieces} pieces · ${a.stock.products} designs`} />
        <Stat label="At selling price" value={a.stock.value} />
        <Stat label="Old stock (6+ months)" value={a.stock.oldCost} tone={a.stock.oldCost > 0 ? "bad" : "plain"} sub={`${a.stock.oldPieces} pieces`} />
        <Stat label="Sold of stock" value={t.items + a.stock.pieces ? `${Math.round(sellThrough * 100)}%` : "–"} money={false} sub="sold ÷ (sold + in stock)" />
      </div>

      <Card title="Month by month">
        <Columns height={130} points={a.months.map((m) => ({ key: m.month, label: monthName(m.month).slice(0, 3), value: Math.max(0, m.amount), title: `${monthName(m.month)}: ${rupees(m.amount)} · ${m.items} pcs · ${rupees(m.profit)} profit` }))} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="By category"><GroupTable rows={a.categories} first="Category" /></Card>
        <Card title="By price"><GroupTable rows={a.priceBands.filter((b) => b.items || b.stockPieces)} first="Selling price" /></Card>
        <Card title="Stock age"><AgeTable a={a} /></Card>
        <Card title="Stock by location">
          <BarList empty="No stock." rows={a.locations.map((l) => ({ key: l.name, label: l.name, value: l.pieces, display: `${l.pieces} pcs`, sub: `${rupees(l.cost)} cost` }))} />
        </Card>
      </div>
      <Card title="Best sellers"><ProductTable rows={a.topProducts.slice(0, 15)} /></Card>
      <Card title="In stock but not selling (oldest first)"><SlowTable rows={a.slow.slice(0, 30)} /></Card>
    </div>
  );
}
