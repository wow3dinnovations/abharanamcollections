import "server-only";
import { requireAdmin } from "@/lib/admin";

export type LookupProduct = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock_qty: number;
  size: string;
  image: string | null;
  category_id: string | null;
  category: string;
  vendor_id: string | null;
  vendor: string;
  barcode: string | null;
};

export type CodeLookup = {
  term: string;
  /** The product with exactly this code (or barcode). */
  exact: (LookupProduct & { stock: { location: string; qty: number }[] }) | null;
  /** Other products whose code starts with what was typed (IH1 -> IH10, IH123G...). */
  family: LookupProduct[];
  /** Same category: same vendor first, then near the same price or name. */
  similar: LookupProduct[];
};

const PICK = "id, sku, name, price, stock_qty, size, image_paths, category_id, categories(name), shop_products(vendor_id, barcode, shop_vendors(name))";

type Raw = {
  id: string;
  sku: string;
  name: string;
  price: number;
  stock_qty: number;
  size: string;
  image_paths: string[];
  category_id: string | null;
  categories: { name: string } | null;
  shop_products: { vendor_id: string | null; barcode: string | null; shop_vendors: { name: string } | null } | null;
};

function shape(r: Raw): LookupProduct {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    price: Number(r.price),
    stock_qty: r.stock_qty,
    size: r.size ?? "",
    image: r.image_paths?.[0] ?? null,
    category_id: r.category_id,
    category: r.categories?.name ?? "",
    vendor_id: r.shop_products?.vendor_id ?? null,
    vendor: r.shop_products?.shop_vendors?.name ?? "",
    barcode: r.shop_products?.barcode ?? null,
  };
}

/** Dashboard: everything about one product code, the codes like it and similar products. */
export async function lookupCode(input: string): Promise<CodeLookup> {
  const { supabase } = await requireAdmin();
  const term = input.trim().toUpperCase().replace(/[^A-Z0-9_./-]/g, "").slice(0, 40);
  const out: CodeLookup = { term, exact: null, family: [], similar: [] };
  if (!term) return out;
  const like = term.replace(/[_\\]/g, (c) => `\\${c}`);

  // Exact code, else a barcode number
  let { data: hit } = await supabase.from("products").select(PICK).ilike("sku", like).limit(1);
  if (!hit?.length) {
    const { data: bc } = await supabase.from("shop_products").select("product_id").eq("barcode", term).limit(1);
    if (bc?.length) hit = (await supabase.from("products").select(PICK).eq("id", bc[0]!.product_id)).data;
  }
  const exactRaw = (hit?.[0] ?? null) as Raw | null;

  const [{ data: fam }, stock] = await Promise.all([
    supabase.from("products").select(PICK).ilike("sku", `${like}%`).order("sku").limit(60),
    exactRaw
      ? supabase.from("shop_stock").select("qty, shop_locations(name)").eq("product_id", exactRaw.id).gt("qty", 0)
      : Promise.resolve({ data: [] as { qty: number; shop_locations: { name: string } | null }[] }),
  ]);
  if (exactRaw) {
    out.exact = {
      ...shape(exactRaw),
      stock: (stock.data ?? []).map((s) => ({ location: s.shop_locations?.name ?? "–", qty: s.qty })).sort((a, b) => b.qty - a.qty),
    };
  }
  out.family = ((fam ?? []) as Raw[]).filter((r) => r.id !== exactRaw?.id).map(shape);

  // Nothing starts with it: try the code with its last characters dropped (IH1239 -> IH123, IH12...).
  if (!exactRaw && !out.family.length) {
    for (let n = term.length - 1; n >= 2 && !out.family.length; n--) {
      const short = like.slice(0, n);
      const { data } = await supabase.from("products").select(PICK).ilike("sku", `${short}%`).order("sku").limit(24);
      out.family = ((data ?? []) as Raw[]).map(shape);
    }
  }

  // Similar: same category as the product found (same vendor first, then nearest price).
  const base = out.exact ?? out.family[0] ?? null;
  if (base?.category_id) {
    const skip = new Set([base.id, ...out.family.map((f) => f.id)]);
    const { data } = await supabase
      .from("products")
      .select(PICK)
      .eq("category_id", base.category_id)
      .eq("is_active", true)
      .gte("price", Math.floor(base.price * 0.6))
      .lte("price", Math.ceil(base.price * 1.4) || 1e9)
      .order("stock_qty", { ascending: false })
      .limit(60);
    out.similar = ((data ?? []) as Raw[])
      .map(shape)
      .filter((p) => !skip.has(p.id))
      .sort(
        (a, b) =>
          Number(b.vendor_id === base.vendor_id && !!base.vendor_id) - Number(a.vendor_id === base.vendor_id && !!base.vendor_id) ||
          Number(b.stock_qty > 0) - Number(a.stock_qty > 0) ||
          Math.abs(a.price - base.price) - Math.abs(b.price - base.price),
      )
      .slice(0, 12);
  }
  return out;
}
