// Shop filters shared by the website and the app, so both list products the same way.

export const SORTS = {
  new: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  name: "Name A–Z",
} as const;
export type SortKey = keyof typeof SORTS;

export const PRICE_BANDS = [
  { key: "u500", label: "Under ₹500", min: null, max: 499.99 },
  { key: "500-1000", label: "₹500 – ₹1,000", min: 500, max: 1000 },
  { key: "1000-2500", label: "₹1,000 – ₹2,500", min: 1000.01, max: 2500 },
  { key: "2500-5000", label: "₹2,500 – ₹5,000", min: 2500.01, max: 5000 },
  { key: "o5000", label: "Above ₹5,000", min: 5000.01, max: null },
] as const;
export type PriceBandKey = (typeof PRICE_BANDS)[number]["key"];

export type ShopFilters = {
  q?: string;
  category?: string; // category slug
  type?: string; // subcategory slug
  collection?: string;
  colour?: string;
  price?: PriceBandKey;
  inStock?: boolean;
  sort?: SortKey;
  page?: number;
};

export const PAGE_SIZE = 24;

/** Reads filters from URL search params (website) or route params (app). Unknown values are ignored. */
export function parseFilters(params: Record<string, string | string[] | undefined>): ShopFilters {
  const one = (k: string) => {
    const v = params[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim().slice(0, 80) : undefined;
  };
  const sort = one("sort");
  const price = one("price");
  const page = Number(one("page") ?? 1);
  return {
    q: one("q"),
    category: one("category"),
    type: one("type"),
    collection: one("collection"),
    colour: one("colour"),
    price: PRICE_BANDS.some((b) => b.key === price) ? (price as PriceBandKey) : undefined,
    inStock: one("instock") === "1",
    sort: sort && sort in SORTS ? (sort as SortKey) : "new",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

/** Back to URL params, leaving out defaults so links stay short. */
export function filtersToParams(f: ShopFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.q) out.q = f.q;
  if (f.category) out.category = f.category;
  if (f.type) out.type = f.type;
  if (f.collection) out.collection = f.collection;
  if (f.colour) out.colour = f.colour;
  if (f.price) out.price = f.price;
  if (f.inStock) out.instock = "1";
  if (f.sort && f.sort !== "new") out.sort = f.sort;
  if (f.page && f.page > 1) out.page = String(f.page);
  return out;
}

export function priceBand(key: PriceBandKey | undefined) {
  return PRICE_BANDS.find((b) => b.key === key);
}

/** Turns free text into a Postgres websearch query: every word must match the start of a word. */
export function searchTerms(q: string): string | null {
  const words = q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 6);
  if (!words.length) return null;
  return words.map((w) => `${w}:*`).join(" & ");
}
