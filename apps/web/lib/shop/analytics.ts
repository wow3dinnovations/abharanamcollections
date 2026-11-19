import "server-only";
import { requireAdmin } from "@/lib/admin";
import { buildAnalytics, type SaleLine, type StockProduct, type VendorInfo } from "@/lib/shop/analytics-calc";
import { istDayStart, istToday } from "@/lib/shop/server";
import { addDays } from "@/lib/shop/reports";

const PAGE = 1000;
const MAX_ROWS = 50000;

/** Reads every row of a query, 1,000 at a time (Supabase sends at most 1,000 per request). */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, what: string) {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) {
      console.error(`analytics ${what}:`, error.message);
      break;
    }
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type Embedded<T> = T | T[] | null;
const one = <T,>(x: Embedded<T>) => (Array.isArray(x) ? (x[0] ?? null) : x);

/** Everything the Analytics page shows, for the dates (and optionally one vendor). */
export async function getAnalytics(from: string, to: string, vendor?: string) {
  const { supabase } = await requireAdmin();
  const start = istDayStart(from);
  const end = istDayStart(addDays(to, 1));

  const [lineRows, productRows, vendorRows, newCustomers, customerCount, stockRows] = await Promise.all([
    readAll(
      (a, b) =>
        supabase
          .from("shop_sale_items")
          .select(
            "id, sale_id, product_id, sku, name, qty, returned_qty, price, cost, shop_sales!inner(created_at, status, subtotal, total, payment_method, customer_id, customer_phone, customer_name)",
          )
          .eq("shop_sales.status", "paid")
          .gte("shop_sales.created_at", start)
          .lt("shop_sales.created_at", end)
          .order("id")
          .range(a, b),
      "bill lines",
    ),
    readAll(
      (a, b) =>
        supabase
          .from("products")
          .select("id, sku, name, price, stock_qty, is_active, added_at, categories(name), shop_products(vendor_id, purchase_rate, purchase_date)")
          .order("id")
          .range(a, b),
      "products",
    ),
    supabase.from("shop_vendors").select("id, name, code_no, shop_locations(name)").order("name"),
    readAll(
      (a, b) => supabase.from("shop_customers").select("id").gte("created_at", start).lt("created_at", end).order("id").range(a, b),
      "customers",
    ),
    supabase.from("shop_customers").select("id", { count: "exact", head: true }),
    readAll(
      (a, b) => supabase.from("shop_stock").select("product_id, qty, shop_locations(name)").gt("qty", 0).order("product_id").range(a, b),
      "stock",
    ),
  ]);

  const lines: SaleLine[] = lineRows.map((r) => {
    const s = one(r.shop_sales as Embedded<{ created_at: string; subtotal: number; total: number; payment_method: string; customer_id: string | null; customer_phone: string; customer_name: string }>)!;
    return {
      sale_id: r.sale_id, created_at: s.created_at, subtotal: Number(s.subtotal), total: Number(s.total), payment_method: s.payment_method,
      customer_id: s.customer_id, customer_phone: s.customer_phone ?? "", customer_name: s.customer_name ?? "",
      product_id: r.product_id, sku: r.sku, name: r.name, qty: r.qty, returned_qty: r.returned_qty ?? 0, price: Number(r.price), cost: Number(r.cost ?? 0),
    };
  });
  const products: StockProduct[] = productRows.map((p) => {
    const sp = one(p.shop_products as Embedded<{ vendor_id: string | null; purchase_rate: number; purchase_date: string | null }>);
    const c = one(p.categories as Embedded<{ name: string }>);
    return {
      id: p.id, sku: p.sku, name: p.name, price: Number(p.price), stock_qty: p.stock_qty ?? 0, is_active: p.is_active, category: c?.name ?? "No category",
      vendor_id: sp?.vendor_id ?? null, purchase_rate: Number(sp?.purchase_rate ?? 0),
      since: sp?.purchase_date ?? new Date(Date.parse(p.added_at) + 5.5 * 3600 * 1000).toISOString().slice(0, 10),
    };
  });
  const vendors: VendorInfo[] = (vendorRows.data ?? []).map((v) => ({
    id: v.id, name: v.name, code_no: v.code_no, city: one(v.shop_locations as Embedded<{ name: string }>)?.name ?? null,
  }));

  const data = buildAnalytics({ lines, products, vendors, newCustomerIds: new Set(newCustomers.map((c) => c.id)), today: istToday(), vendor });

  // Pieces in stock per location (for the shop as a whole or this vendor).
  const productIds = new Set(vendor ? products.filter((p) => (vendor === "none" ? !p.vendor_id : p.vendor_id === vendor)).map((p) => p.id) : products.map((p) => p.id));
  const active = new Map(products.map((p) => [p.id, p]));
  const locs = new Map<string, { name: string; products: number; pieces: number; cost: number; value: number }>();
  for (const s of stockRows) {
    const p = active.get(s.product_id);
    if (!p || !p.is_active || !productIds.has(s.product_id)) continue;
    const name = one(s.shop_locations as Embedded<{ name: string }>)?.name ?? "No location";
    const l = locs.get(name) ?? { name, products: 0, pieces: 0, cost: 0, value: 0 };
    l.products += 1;
    l.pieces += s.qty;
    l.cost += s.qty * p.purchase_rate;
    l.value += s.qty * p.price;
    locs.set(name, l);
  }

  return {
    ...data,
    vendorList: vendors,
    customerCount: customerCount.count ?? 0,
    locations: [...locs.values()].sort((a, b) => b.pieces - a.pieces),
    capped: lineRows.length >= MAX_ROWS,
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof getAnalytics>>;
