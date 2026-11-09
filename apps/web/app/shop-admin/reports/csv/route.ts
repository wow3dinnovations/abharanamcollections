import { getReport, pickDay } from "@/lib/shop/reports";
import { istToday } from "@/lib/shop/server";
import { getSessionProfile } from "@/lib/supabase/server";

const COLS = [
  ["period", "Date / month"],
  ["bills", "Bills"],
  ["items", "Pieces sold"],
  ["gross", "Gross sales"],
  ["discount", "Discount"],
  ["sales", "Sales after discount"],
  ["returns", "Returns"],
  ["net_sales", "Net sales"],
  ["cost", "Cost of goods"],
  ["gross_profit", "Profit without expenses"],
  ["expenses", "Expenses"],
  ["net_profit", "Profit with expenses"],
  ["purchases", "Stock bought"],
] as const;

/** The profit & loss table as a CSV file (opens in Excel). */
export async function GET(req: Request) {
  const session = await getSessionProfile();
  if (!session?.isAdmin) return new Response("Not found", { status: 404 });
  const u = new URL(req.url);
  const today = istToday();
  let from = pickDay(u.searchParams.get("from") ?? undefined, `${today.slice(0, 7)}-01`);
  let to = pickDay(u.searchParams.get("to") ?? undefined, today);
  if (to < from) [from, to] = [to, from];
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  const by = u.searchParams.get("by") === "month" || days > 400 ? "month" : "day";
  const rows = await getReport(from, to, by);
  const lines = [
    COLS.map((c) => c[1]).join(","),
    ...rows.map((r) => COLS.map(([k]) => (k === "period" ? (by === "month" ? r.period.slice(0, 7) : r.period) : String(r[k]))).join(",")),
  ];
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="abharanam-profit-${from}-to-${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
