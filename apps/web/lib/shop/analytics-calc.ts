// Analytics figures worked out from bill lines, products and stock (no database update needed).
// Pure functions only, so they can be checked without a database.

export type SaleLine = {
  sale_id: string;
  created_at: string;
  subtotal: number;
  total: number;
  payment_method: string;
  customer_id: string | null;
  customer_phone: string;
  customer_name: string;
  product_id: string | null;
  sku: string;
  name: string;
  qty: number;
  returned_qty: number;
  price: number;
  cost: number;
};

export type StockProduct = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock_qty: number;
  is_active: boolean;
  category: string;
  vendor_id: string | null;
  purchase_rate: number;
  /** Purchase date, or the day it was added (YYYY-MM-DD). */
  since: string;
};

export type VendorInfo = { id: string; name: string; city: string | null; code_no: number | null };

export type Totals = {
  bills: number;
  items: number;
  returned: number;
  amount: number;
  cost: number;
  profit: number;
  designs: number;
  /** Average days from purchase to sale, per piece sold. */
  daysToSell: number | null;
};

export type Group = Totals & {
  key: string;
  name: string;
  stockProducts: number;
  stockPieces: number;
  stockCost: number;
  stockValue: number;
  /** Pieces in stock for over 180 days. */
  oldPieces: number;
  oldCost: number;
  /** Sold ÷ (sold + in stock). */
  sellThrough: number;
};

export type VendorGroup = Group & { id: string | null; city: string | null; code_no: number | null; categories: number };

export type ProductRow = {
  id: string | null;
  sku: string;
  name: string;
  category: string;
  vendor_id: string | null;
  items: number;
  amount: number;
  profit: number;
  stock: number;
};

export type SlowRow = { id: string; sku: string; name: string; category: string; vendor_id: string | null; stock: number; cost: number; days: number };

export type CustomerRow = { key: string; name: string; phone: string; bills: number; items: number; amount: number; last: string };

export const AGE_BUCKETS = ["Up to 1 month", "1–3 months", "3–6 months", "6–12 months", "Over 1 year"] as const;
export const ageBucket = (days: number) => (days <= 30 ? 0 : days <= 90 ? 1 : days <= 180 ? 2 : days <= 365 ? 3 : 4);

export const PRICE_BANDS = [
  { label: "Up to ₹500", max: 500 },
  { label: "₹501–1,000", max: 1000 },
  { label: "₹1,001–2,000", max: 2000 },
  { label: "₹2,001–5,000", max: 5000 },
  { label: "Over ₹5,000", max: Infinity },
] as const;
const priceBand = (p: number) => PRICE_BANDS.findIndex((b) => p <= b.max);

export const BILL_BANDS = [
  { label: "Up to ₹1,000", max: 1000 },
  { label: "₹1,001–3,000", max: 3000 },
  { label: "₹3,001–5,000", max: 5000 },
  { label: "₹5,001–10,000", max: 10000 },
  { label: "Over ₹10,000", max: Infinity },
] as const;

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const IST = 5.5 * 3600 * 1000;
/** India date (YYYY-MM-DD) of a timestamp. */
export const istDay = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
/** Whole rupees: analytics figures don't need paise. */
const r2 = (n: number) => Math.round(n);

/** A line's share of the bill after the bill discount, leaving out returned pieces. */
function lineFigures(l: SaleLine) {
  const kept = Math.max(0, l.qty - l.returned_qty);
  const ratio = l.subtotal > 0 ? l.total / l.subtotal : 0;
  return { kept, amount: kept * l.price * ratio, cost: kept * l.cost };
}

type Acc = { bills: Set<string>; designs: Set<string>; items: number; returned: number; amount: number; cost: number; ageDays: number; agePieces: number };
const newAcc = (): Acc => ({ bills: new Set(), designs: new Set(), items: 0, returned: 0, amount: 0, cost: 0, ageDays: 0, agePieces: 0 });
function addLine(a: Acc, l: SaleLine, f: ReturnType<typeof lineFigures>, since: string | undefined) {
  a.bills.add(l.sale_id);
  if (f.kept > 0) a.designs.add(l.product_id ?? l.sku);
  a.items += f.kept;
  a.returned += l.returned_qty;
  a.amount += f.amount;
  a.cost += f.cost;
  if (since && f.kept > 0) {
    const d = daysBetween(since, istDay(l.created_at));
    if (d >= 0) {
      a.ageDays += d * f.kept;
      a.agePieces += f.kept;
    }
  }
}
const totalsOf = (a: Acc): Totals => ({
  bills: a.bills.size,
  items: a.items,
  returned: a.returned,
  amount: r2(a.amount),
  cost: r2(a.cost),
  profit: r2(a.amount - a.cost),
  designs: a.designs.size,
  daysToSell: a.agePieces ? Math.round(a.ageDays / a.agePieces) : null,
});

type StockAcc = { products: number; pieces: number; cost: number; value: number; oldPieces: number; oldCost: number };
const newStock = (): StockAcc => ({ products: 0, pieces: 0, cost: 0, value: 0, oldPieces: 0, oldCost: 0 });
function addStock(s: StockAcc, p: StockProduct, today: string) {
  if (!p.is_active || p.stock_qty <= 0) return;
  s.products += 1;
  s.pieces += p.stock_qty;
  s.cost += p.stock_qty * p.purchase_rate;
  s.value += p.stock_qty * p.price;
  if (daysBetween(p.since, today) > 180) {
    s.oldPieces += p.stock_qty;
    s.oldCost += p.stock_qty * p.purchase_rate;
  }
}
function group(key: string, name: string, a: Acc | undefined, s: StockAcc | undefined): Group {
  const t = totalsOf(a ?? newAcc());
  const st = s ?? newStock();
  return {
    key, name, ...t,
    stockProducts: st.products, stockPieces: st.pieces, stockCost: r2(st.cost), stockValue: r2(st.value),
    oldPieces: st.oldPieces, oldCost: r2(st.oldCost),
    sellThrough: t.items + st.pieces > 0 ? t.items / (t.items + st.pieces) : 0,
  };
}

/** Groups lines and stock by a key (category, vendor, price band...) and adds them up. */
function groupBy(
  lines: SaleLine[], products: StockProduct[], byId: Map<string, StockProduct>, today: string,
  keyOfProduct: (p: StockProduct | undefined, l?: SaleLine) => string,
) {
  const sold = new Map<string, Acc>();
  const stock = new Map<string, StockAcc>();
  for (const l of lines) {
    const p = l.product_id ? byId.get(l.product_id) : undefined;
    const k = keyOfProduct(p, l);
    if (!sold.has(k)) sold.set(k, newAcc());
    addLine(sold.get(k)!, l, lineFigures(l), p?.since);
  }
  for (const p of products) {
    const k = keyOfProduct(p);
    if (!stock.has(k)) stock.set(k, newStock());
    addStock(stock.get(k)!, p, today);
  }
  return { sold, stock, keys: [...new Set([...sold.keys(), ...stock.keys()])] };
}

export function buildAnalytics(input: {
  lines: SaleLine[];
  products: StockProduct[];
  vendors: VendorInfo[];
  /** Customers whose first bill falls in the dates (their id). */
  newCustomerIds: Set<string>;
  today: string;
  /** Only this vendor's lines and products ("none" = no vendor). */
  vendor?: string;
}) {
  const { vendors, newCustomerIds, today } = input;
  const allById = new Map(input.products.map((p) => [p.id, p]));
  const vendorOf = (pid: string | null) => (pid ? (allById.get(pid)?.vendor_id ?? null) : null);
  const only = input.vendor;
  const match = (v: string | null) => !only || (only === "none" ? v === null : v === only);
  const lines = input.lines.filter((l) => match(vendorOf(l.product_id)));
  const products = input.products.filter((p) => match(p.vendor_id));
  const byId = allById;

  // ---------------------------------------------------------------- totals
  const all = newAcc();
  for (const l of lines) addLine(all, l, lineFigures(l), l.product_id ? byId.get(l.product_id)?.since : undefined);
  const totals = totalsOf(all);
  const stockAll = newStock();
  for (const p of products) addStock(stockAll, p, today);

  // ---------------------------------------------------------------- bills
  type Bill = { id: string; created_at: string; total: number; payment: string; customer: string | null; name: string; phone: string; items: number; amount: number };
  const bills = new Map<string, Bill>();
  for (const l of lines) {
    const f = lineFigures(l);
    let b = bills.get(l.sale_id);
    if (!b) {
      const phone = l.customer_phone.replace(/\D/g, "");
      b = { id: l.sale_id, created_at: l.created_at, total: l.total, payment: l.payment_method, customer: l.customer_id ?? (phone.length >= 7 ? `ph:${phone}` : null), name: l.customer_name, phone, items: 0, amount: 0 };
      bills.set(l.sale_id, b);
    }
    b.items += f.kept;
    b.amount += f.amount;
  }
  const billList = [...bills.values()];
  const weekday = WEEKDAYS.map((name) => ({ name, bills: 0, amount: 0 }));
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, bills: 0, amount: 0 }));
  const billBands = BILL_BANDS.map((b) => ({ label: b.label, bills: 0, amount: 0 }));
  for (const b of billList) {
    const t = new Date(Date.parse(b.created_at) + IST);
    weekday[t.getUTCDay()]!.bills += 1;
    weekday[t.getUTCDay()]!.amount += b.amount;
    hours[t.getUTCHours()]!.bills += 1;
    hours[t.getUTCHours()]!.amount += b.amount;
    const band = billBands[BILL_BANDS.findIndex((x) => b.amount <= x.max)]!;
    band.bills += 1;
    band.amount += b.amount;
  }

  // ---------------------------------------------------------------- months (for the vendor trend)
  const monthAcc = new Map<string, Acc>();
  for (const l of lines) {
    const m = istDay(l.created_at).slice(0, 7);
    if (!monthAcc.has(m)) monthAcc.set(m, newAcc());
    addLine(monthAcc.get(m)!, l, lineFigures(l), undefined);
  }
  const months = [...monthAcc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, a]) => ({ month, ...totalsOf(a) }));

  // ---------------------------------------------------------------- categories, price bands, vendors
  const cat = groupBy(lines, products, byId, today, (p) => p?.category || "No category");
  const categories = cat.keys.map((k) => group(k, k, cat.sold.get(k), cat.stock.get(k))).sort((a, b) => b.amount - a.amount || b.stockPieces - a.stockPieces);

  const pb = groupBy(lines, products, byId, today, (p, l) => String(priceBand(p ? p.price : (l?.price ?? 0))));
  const priceBands = PRICE_BANDS.map((b, i) => group(String(i), b.label, pb.sold.get(String(i)), pb.stock.get(String(i))));

  const vInfo = new Map(vendors.map((v) => [v.id, v]));
  const ven = groupBy(lines, products, byId, today, (p) => p?.vendor_id ?? "none");
  const vendorCats = new Map<string, Set<string>>();
  for (const p of products) {
    const k = p.vendor_id ?? "none";
    if (!vendorCats.has(k)) vendorCats.set(k, new Set());
    vendorCats.get(k)!.add(p.category);
  }
  const vendorRows: VendorGroup[] = ven.keys
    .map((k) => {
      const v = vInfo.get(k);
      return {
        ...group(k, v?.name ?? "No vendor", ven.sold.get(k), ven.stock.get(k)),
        id: k === "none" ? null : k, city: v?.city ?? null, code_no: v?.code_no ?? null, categories: vendorCats.get(k)?.size ?? 0,
      };
    })
    .sort((a, b) => b.amount - a.amount || b.stockPieces - a.stockPieces);

  // ---------------------------------------------------------------- products
  const prod = new Map<string, ProductRow>();
  for (const l of lines) {
    const f = lineFigures(l);
    if (f.kept <= 0) continue;
    const k = l.product_id ?? `sku:${l.sku}`;
    const p = l.product_id ? byId.get(l.product_id) : undefined;
    const row = prod.get(k) ?? { id: l.product_id, sku: l.sku, name: l.name, category: p?.category ?? "", vendor_id: p?.vendor_id ?? null, items: 0, amount: 0, profit: 0, stock: p?.stock_qty ?? 0 };
    row.items += f.kept;
    row.amount += f.amount;
    row.profit += f.amount - f.cost;
    prod.set(k, row);
  }
  const productRows = [...prod.values()].map((p) => ({ ...p, amount: r2(p.amount), profit: r2(p.profit) }));
  const soldIds = new Set(lines.filter((l) => l.qty > l.returned_qty).map((l) => l.product_id));
  // In stock and not sold in these dates, oldest first.
  const slow: SlowRow[] = products
    .filter((p) => p.is_active && p.stock_qty > 0 && !soldIds.has(p.id))
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name, category: p.category, vendor_id: p.vendor_id, stock: p.stock_qty, cost: r2(p.stock_qty * p.purchase_rate), days: Math.max(0, daysBetween(p.since, today)) }))
    .sort((a, b) => b.days - a.days || b.cost - a.cost);

  // ---------------------------------------------------------------- stock age
  const ages = AGE_BUCKETS.map((label) => ({ label, products: 0, pieces: 0, cost: 0, value: 0 }));
  for (const p of products) {
    if (!p.is_active || p.stock_qty <= 0) continue;
    const a = ages[ageBucket(Math.max(0, daysBetween(p.since, today)))]!;
    a.products += 1;
    a.pieces += p.stock_qty;
    a.cost += p.stock_qty * p.purchase_rate;
    a.value += p.stock_qty * p.price;
  }

  // ---------------------------------------------------------------- customers
  const cust = new Map<string, CustomerRow>();
  let walkIn = { bills: 0, amount: 0 };
  for (const b of billList) {
    if (!b.customer) {
      walkIn = { bills: walkIn.bills + 1, amount: walkIn.amount + b.amount };
      continue;
    }
    const c = cust.get(b.customer) ?? { key: b.customer, name: "", phone: b.phone, bills: 0, items: 0, amount: 0, last: "" };
    c.bills += 1;
    c.items += b.items;
    c.amount += b.amount;
    if (b.created_at > c.last) {
      c.last = b.created_at;
      if (b.name) c.name = b.name;
    }
    if (!c.name && b.name) c.name = b.name;
    cust.set(b.customer, c);
  }
  const customers = [...cust.values()].map((c) => ({ ...c, amount: r2(c.amount) })).sort((a, b) => b.amount - a.amount);
  const isNew = (c: CustomerRow) => newCustomerIds.has(c.key);
  const newBuyers = customers.filter(isNew);
  const returning = customers.filter((c) => !isNew(c));
  const customerStats = {
    buyers: customers.length,
    newBuyers: newBuyers.length,
    newAmount: r2(newBuyers.reduce((s, c) => s + c.amount, 0)),
    returning: returning.length,
    returningAmount: r2(returning.reduce((s, c) => s + c.amount, 0)),
    repeat: customers.filter((c) => c.bills > 1).length,
    walkInBills: walkIn.bills,
    walkInAmount: r2(walkIn.amount),
  };

  return {
    totals,
    stock: { products: stockAll.products, pieces: stockAll.pieces, cost: r2(stockAll.cost), value: r2(stockAll.value), oldPieces: stockAll.oldPieces, oldCost: r2(stockAll.oldCost) },
    billCount: billList.length,
    weekday,
    hours,
    billBands,
    months,
    categories,
    priceBands,
    vendors: vendorRows,
    topProducts: [...productRows].sort((a, b) => b.amount - a.amount).slice(0, 25),
    topProfit: [...productRows].sort((a, b) => b.profit - a.profit).slice(0, 10),
    topPieces: [...productRows].sort((a, b) => b.items - a.items).slice(0, 10),
    slow,
    ages,
    customers,
    customerStats,
  };
}

export type Analytics = ReturnType<typeof buildAnalytics>;
