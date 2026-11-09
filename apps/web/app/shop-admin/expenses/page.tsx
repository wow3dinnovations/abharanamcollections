import { rupees } from "@abh/core";
import Link from "next/link";
import { Button, Card, Field, Input, Select, Table, Td } from "@/components/admin/ui";
import { Section, Stat } from "@/components/shop/Stats";
import { requireAdmin } from "@/lib/admin";
import { addMonths, dayName, EXPENSE_TYPES, monthName, monthRange, PAID_BY, pickMonth } from "@/lib/shop/reports";
import { getMasters, istToday } from "@/lib/shop/server";
import { addExpense, deleteExpense } from "../actions";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string; type?: string }> }) {
  const sp = await searchParams;
  const { supabase } = await requireAdmin();
  const today = istToday();
  const month = pickMonth(sp.month, today.slice(0, 7));
  const { from, to } = monthRange(month);
  const type = sp.type && EXPENSE_TYPES[sp.type] ? sp.type : "";
  let q = supabase
    .from("shop_expenses")
    .select("id, spent_on, category, amount, paid_by, note, shop_locations(name)")
    .gte("spent_on", from)
    .lte("spent_on", to)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (type) q = q.eq("category", type);
  const [{ data }, m] = await Promise.all([q, getMasters()]);
  const rows = data ?? [];
  const total = rows.reduce((a, e) => a + Number(e.amount), 0);
  const byType = Object.keys(EXPENSE_TYPES)
    .map((k) => ({ k, amount: rows.filter((e) => e.category === k).reduce((a, e) => a + Number(e.amount), 0) }))
    .filter((x) => x.amount > 0);
  const byDay = [...new Set(rows.map((e) => e.spent_on))].map((d) => ({
    d,
    amount: rows.filter((e) => e.spent_on === d).reduce((a, e) => a + Number(e.amount), 0),
  }));
  const todayTotal = month === today.slice(0, 7) ? byDay.find((x) => x.d === today)?.amount ?? 0 : null;
  const link = (mo: string) => `/shop-admin/expenses?month=${mo}${type ? `&type=${type}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold">Shop expenses</h1>
          <p className="text-sm text-muted">Rent, electricity, other bills, donations, salaries… They are taken off the month&apos;s profit.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={link(addMonths(month, -1))} className="rounded-md border border-cream bg-white px-2 py-1">←</Link>
          <form className="flex gap-2">
            <Input type="month" name="month" defaultValue={month} aria-label="Month" />
            {type && <input type="hidden" name="type" value={type} />}
            <Button variant="secondary">Show</Button>
          </form>
          <Link href={link(addMonths(month, 1))} className="rounded-md border border-cream bg-white px-2 py-1">→</Link>
        </div>
      </div>

      <Card title="Add an expense">
        <form action={addExpense} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Date *"><Input type="date" name="spent_on" required defaultValue={today} max={today} /></Field>
          <Field label="For *">
            <Select name="category" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {Object.entries(EXPENSE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Amount (₹) *"><Input type="number" name="amount" min="1" step="0.01" inputMode="decimal" required /></Field>
          <Field label="Paid by">
            <Select name="paid_by" defaultValue="cash">
              {Object.entries(PAID_BY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Shop">
            <Select name="location_id" defaultValue="">
              <option value="">–</option>
              {m.locations.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Note"><Input name="note" maxLength={300} placeholder="November rent, temple donation…" /></Field>
          <div className="sm:col-span-2 lg:col-span-6"><Button>Save expense</Button></div>
        </form>
      </Card>

      <Section title={monthName(month)}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Expenses this month" value={total} tone={total > 0 ? "bad" : "plain"} sub={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`} />
          {todayTotal !== null && <Stat label="Today" value={todayTotal} tone={todayTotal > 0 ? "bad" : "plain"} />}
          {byType.map((x) => (
            <Stat key={x.k} label={EXPENSE_TYPES[x.k]!} value={x.amount} />
          ))}
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <Card title="All expenses">
          <div className="mb-3 flex flex-wrap gap-1 text-xs">
            <Link href={`/shop-admin/expenses?month=${month}`} className={`rounded-full px-2 py-0.5 ${!type ? "bg-maroon text-white" : "bg-cream"}`}>All</Link>
            {Object.entries(EXPENSE_TYPES).map(([k, v]) => (
              <Link key={k} href={`/shop-admin/expenses?month=${month}&type=${k}`} className={`rounded-full px-2 py-0.5 ${type === k ? "bg-maroon text-white" : "bg-cream"}`}>{v}</Link>
            ))}
          </div>
          <Table head={["Date", "For", "Note", "Paid by", "Amount", ""]}>
            {rows.map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{dayName(e.spent_on)}</Td>
                <Td>{EXPENSE_TYPES[e.category] ?? e.category}</Td>
                <Td className="text-xs">{e.note}{e.shop_locations?.name ? ` · ${e.shop_locations.name}` : ""}</Td>
                <Td>{PAID_BY[e.paid_by] ?? e.paid_by}</Td>
                <Td className="font-medium">{rupees(e.amount)}</Td>
                <Td>
                  <form action={deleteExpense}>
                    <input type="hidden" name="id" value={e.id} />
                    <button className="text-xs text-red-700 underline">Delete</button>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
          {!rows.length && <p className="text-sm text-muted">No expenses in {monthName(month)}.</p>}
        </Card>
        <Card title="Day by day">
          <ul className="divide-y divide-stone-100 text-sm">
            {byDay.map((x) => (
              <li key={x.d} className="flex justify-between py-1.5"><span>{dayName(x.d, true)}</span><b>{rupees(x.amount)}</b></li>
            ))}
          </ul>
          {!byDay.length && <p className="text-sm text-muted">–</p>}
        </Card>
      </div>
    </div>
  );
}
