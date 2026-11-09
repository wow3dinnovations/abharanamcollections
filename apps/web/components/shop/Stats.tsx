import { rupees } from "@abh/core";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ReportRow } from "@/lib/shop/reports";

type Tone = "plain" | "good" | "bad" | "auto";

/** ₹1,200 or −₹1,200 (a loss). */
export const money = (n: number) => (n < 0 ? `−${rupees(-n)}` : rupees(n));

/** A white number card, as on the dashboard. "auto" shows green for 0 or more and red below 0. */
export function Stat({ label, value, sub, tone = "plain", money: asMoney = true }: { label: string; value: number | string; sub?: ReactNode; tone?: Tone; money?: boolean }) {
  const n = typeof value === "number" ? value : NaN;
  const color =
    tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-700" : tone === "auto" ? (n < 0 ? "text-red-700" : "text-green-700") : "text-ink";
  return (
    <div className="rounded-xl border border-cream bg-white p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${color}`}>{typeof value === "number" && asMoney ? money(value) : value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** The big maroon card. */
export function HeroStat({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-maroon-dark via-maroon to-[#8a2638] p-6 text-white shadow-md">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-light">{label}</p>
      <p className="mt-2 font-display text-5xl font-bold">{value}</p>
      {sub && <p className="mt-2 text-sm text-cream/85">{sub}</p>}
    </div>
  );
}

export function Section({ title, note, children, action }: { title: string; note?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          {note && <p className="text-xs text-muted">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Profit tiles for a period: with and without expenses. */
export function ProfitTiles({ r }: { r: ReportRow }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
      <Stat label="Sales (net)" value={r.net_sales} sub={r.returns > 0 ? `after ${rupees(r.returns)} returns` : undefined} />
      <Stat label="Cost of goods" value={r.cost} sub="purchase rate of pieces sold" />
      <Stat label="Profit without expenses" value={r.gross_profit} tone="auto" />
      <Stat label="Expenses" value={r.expenses} tone={r.expenses > 0 ? "bad" : "plain"} />
      <Stat label="Profit with expenses" value={r.net_profit} tone="auto" sub={r.net_profit < 0 ? "loss" : "profit"} />
      <Stat label="Discounts given" value={r.discount} />
      <Stat label="Purchases (stock bought)" value={r.purchases} sub="not deducted above" />
    </div>
  );
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "–");

/** Day-wise or month-wise table with a total line. `link` makes the first column a link. */
export function ReportTable({ rows, total, label, link }: { rows: ReportRow[]; total: ReportRow; label: (p: string) => string; link?: (p: string) => string }) {
  const head = ["", "Bills", "Pieces", "Gross", "Discount", "Returns", "Net sales", "Cost", "Profit w/o exp.", "Margin", "Expenses", "Profit with exp."];
  const line = (r: ReportRow, first: ReactNode, bold = false) => (
    <tr key={r.period || "total"} className={bold ? "border-t-2 border-cream font-semibold" : r.bills === 0 && r.expenses === 0 ? "text-muted" : ""}>
      <td className="whitespace-nowrap px-2 py-1.5">{first}</td>
      <td className="px-2 py-1.5 text-right">{r.bills}</td>
      <td className="px-2 py-1.5 text-right">{r.items - r.returned_items}</td>
      <td className="px-2 py-1.5 text-right">{money(r.gross)}</td>
      <td className="px-2 py-1.5 text-right">{money(r.discount)}</td>
      <td className="px-2 py-1.5 text-right">{money(r.returns)}</td>
      <td className="px-2 py-1.5 text-right font-medium">{money(r.net_sales)}</td>
      <td className="px-2 py-1.5 text-right">{money(r.cost)}</td>
      <td className={`px-2 py-1.5 text-right ${r.gross_profit < 0 ? "text-red-700" : "text-green-700"}`}>{money(r.gross_profit)}</td>
      <td className="px-2 py-1.5 text-right">{pct(r.gross_profit, r.net_sales)}</td>
      <td className="px-2 py-1.5 text-right text-red-700">{r.expenses ? money(r.expenses) : "–"}</td>
      <td className={`px-2 py-1.5 text-right font-medium ${r.net_profit < 0 ? "text-red-700" : "text-green-700"}`}>{money(r.net_profit)}</td>
    </tr>
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-cream bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-cream bg-cream/40 text-[11px] uppercase text-stone-500">
          <tr>{head.map((h, i) => <th key={h || i} className={`px-2 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.map((r) => line(r, link ? <Link href={link(r.period)} className="underline">{label(r.period)}</Link> : label(r.period)))}
          {line(total, "Total", true)}
        </tbody>
      </table>
    </div>
  );
}
