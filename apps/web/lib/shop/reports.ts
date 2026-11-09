import "server-only";
import { requireAdmin } from "@/lib/admin";

/** One row of shop_report (see the migration for what each figure means). */
export type ReportRow = {
  period: string;
  bills: number;
  items: number;
  gross: number;
  discount: number;
  sales: number;
  returns: number;
  returned_items: number;
  net_sales: number;
  cost: number;
  gross_profit: number;
  expenses: number;
  net_profit: number;
  purchases: number;
};

const NUMS: (keyof ReportRow)[] = [
  "bills", "items", "gross", "discount", "sales", "returns", "returned_items", "net_sales", "cost", "gross_profit",
  "expenses", "net_profit", "purchases",
];

export const EMPTY_ROW: ReportRow = Object.fromEntries([["period", ""], ...NUMS.map((k) => [k, 0])]) as ReportRow;

/** Day-wise, month-wise or one total row. */
export async function getReport(from: string, to: string, by: "day" | "month" | "total"): Promise<ReportRow[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("shop_report", { p_from: from, p_to: to, p_by: by });
  // Without the database update (or on a bad date range) the page still opens, with zeros.
  if (error) {
    console.error("shop_report:", error.message);
    return by === "total" ? [{ ...EMPTY_ROW, period: from }] : [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const row = { ...EMPTY_ROW, period: String(r.period ?? "") };
    for (const k of NUMS) (row as Record<string, unknown>)[k] = Number(r[k] ?? 0);
    return row;
  });
}

/** Adds rows up (for a Total line). */
export function sumRows(rows: ReportRow[]): ReportRow {
  const out = { ...EMPTY_ROW };
  for (const r of rows) for (const k of NUMS) (out as Record<string, unknown>)[k] = (out[k] as number) + (r[k] as number);
  return out;
}

export type Breakdown = {
  categories: { name: string; items: number; amount: number; cost: number; profit: number }[];
  payments: { name: string; bills: number; amount: number }[];
  products: { id: string | null; sku: string; name: string; items: number; amount: number; profit: number }[];
  expenses: { name: string; count: number; amount: number }[];
};

export async function getBreakdown(from: string, to: string): Promise<Breakdown> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("shop_breakdown", { p_from: from, p_to: to });
  if (error) console.error("shop_breakdown:", error.message);
  const d = (data ?? {}) as Partial<Breakdown>;
  return { categories: d.categories ?? [], payments: d.payments ?? [], products: d.products ?? [], expenses: d.expenses ?? [] };
}

export type VendorRow = {
  id: string | null;
  name: string;
  code_no: number | null;
  city: string | null;
  bills: number;
  items: number;
  returned: number;
  designs: number;
  amount: number;
  cost: number;
  profit: number;
  stock_products: number;
  stock_pieces: number;
  stock_cost: number;
  stock_value: number;
};

export async function getVendorReport(from: string, to: string): Promise<VendorRow[]> {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("shop_vendor_report", { p_from: from, p_to: to });
  if (error) console.error("shop_vendor_report:", error.message);
  return (data ?? []) as VendorRow[];
}

export const EXPENSE_TYPES: Record<string, string> = {
  rent: "Shop rent",
  electricity: "Electricity bill",
  bills: "Other bills (water, phone, internet)",
  donation: "Donation",
  salary: "Salary",
  transport: "Transport",
  maintenance: "Repairs & maintenance",
  other: "Other",
};

export const PAID_BY: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", bank: "Bank transfer" };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

/** A YYYY-MM-DD from the address bar, or the fallback. */
export function pickDay(v: string | undefined, fallback: string) {
  return v && DAY.test(v) && !Number.isNaN(Date.parse(v)) ? v : fallback;
}

/** A YYYY-MM from the address bar, or the fallback. */
export function pickMonth(v: string | undefined, fallback: string) {
  return v && MONTH.test(v) && Number(v.slice(5)) >= 1 && Number(v.slice(5)) <= 12 ? v : fallback;
}

/** First and last day of a YYYY-MM month. */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/** "2026-11" -> "November 2026"; "2026-11-09" -> "9 Nov 2026". */
export function monthName(month: string) {
  return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function dayName(day: string, weekday = false) {
  return new Date(`${day}T00:00:00Z`).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", ...(weekday ? { weekday: "short" } : {}), timeZone: "UTC",
  });
}

/** Moves a YYYY-MM by n months. */
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Moves a YYYY-MM-DD by n days. */
export function addDays(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}
