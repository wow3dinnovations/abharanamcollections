import Link from "next/link";
import { PrintButton } from "@/components/shop/BillTools";
import { ProfitTiles, ReportTable, Section, Stat } from "@/components/shop/Stats";
import { getReport, monthName, monthRange, pickMonth, sumRows } from "@/lib/shop/reports";
import { istToday } from "@/lib/shop/server";

export default async function MonthlySales({ searchParams }: { searchParams: Promise<{ year?: string; month?: string }> }) {
  const sp = await searchParams;
  const today = istToday();
  const thisYear = Number(today.slice(0, 4));
  const year = /^\d{4}$/.test(sp.year ?? "") && Number(sp.year) >= 2000 && Number(sp.year) <= thisYear ? Number(sp.year) : thisYear;
  const month = pickMonth(sp.month, year === thisYear ? today.slice(0, 7) : `${year}-12`);
  const yearEnd = year === thisYear ? today : `${year}-12-31`;
  const mr = monthRange(month);
  const [rows, monthRow] = await Promise.all([
    getReport(`${year}-01-01`, yearEnd, "month"),
    getReport(mr.from, mr.to < today ? mr.to : today, "total"),
  ]);
  const total = sumRows(rows);
  const m = monthRow[0]!;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">Monthly sales</h1>
          <p className="text-sm text-muted">Sales and profit for each month, with and without the shop expenses.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
          <Link href={`/shop-admin/sales/monthly?year=${year - 1}`} className="rounded-md border border-cream bg-white px-2 py-1">← {year - 1}</Link>
          <span className="font-semibold">{year}</span>
          {year < thisYear && <Link href={`/shop-admin/sales/monthly?year=${year + 1}`} className="rounded-md border border-cream bg-white px-2 py-1">{year + 1} →</Link>}
          <PrintButton />
        </div>
      </div>

      <Section
        title={monthName(month)}
        note={<>Pick another month in the table below. <Link href={`/shop-admin/sales/daily?day=${mr.to < today ? mr.to : today}`} className="underline">See it day by day</Link></>}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Bills" value={m.bills} money={false} />
          <Stat label="Pieces sold" value={m.items - m.returned_items} money={false} />
          <Stat label="Gross sales" value={m.gross} />
          <Stat label="Returns" value={m.returns} />
        </div>
        <ProfitTiles r={m} />
      </Section>

      <Section title={`${year} month by month`}>
        <ReportTable rows={rows} total={total} label={(p) => monthName(p)} link={(p) => `/shop-admin/sales/monthly?year=${year}&month=${p.slice(0, 7)}`} />
      </Section>

      <Section title={`${year} in total`}>
        <ProfitTiles r={total} />
      </Section>
    </div>
  );
}
