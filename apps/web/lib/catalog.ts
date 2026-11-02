import "server-only";
import { PAGE_SIZE, priceBand, searchTerms, type ShopFilters } from "@abh/core";
import type { Tables } from "@abh/db";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CatalogItem = Omit<Tables<"catalog">, "search">;
export type CategorySummary = Tables<"category_summary">;
export type StoreSettings = Tables<"store_settings">;

const CARD_COLUMNS =
  "id, sku, name, slug, category_id, category_name, category_slug, subcategory_name, subcategory_slug, price, mrp, collection, colour, in_stock, stock_qty, image_paths, is_featured, added_at";

export const getSettings = cache(async (): Promise<StoreSettings | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
  return data;
});

export const getCategories = cache(async (): Promise<CategorySummary[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("category_summary").select("*").order("sort_order").order("name");
  return data ?? [];
});

export type CardItem = Pick<
  CatalogItem,
  | "id" | "sku" | "name" | "slug" | "category_name" | "category_slug" | "price" | "mrp"
  | "in_stock" | "stock_qty" | "image_paths" | "is_featured" | "collection"
>;

export async function listProducts(f: ShopFilters, pageSize = PAGE_SIZE) {
  const supabase = await createClient();
  let q = supabase.from("catalog").select(CARD_COLUMNS, { count: "exact" });
  if (f.category) q = q.eq("category_slug", f.category);
  if (f.type) q = q.eq("subcategory_slug", f.type);
  if (f.collection) q = q.ilike("collection", f.collection);
  if (f.colour) q = q.ilike("colour", f.colour);
  if (f.inStock) q = q.eq("in_stock", true);
  const band = priceBand(f.price);
  if (band?.min != null) q = q.gte("price", band.min);
  if (band?.max != null) q = q.lte("price", band.max);
  const terms = f.q ? searchTerms(f.q) : null;
  if (terms) q = q.textSearch("search", terms, { config: "simple" });
  switch (f.sort) {
    case "price_asc": q = q.order("price", { ascending: true }); break;
    case "price_desc": q = q.order("price", { ascending: false }); break;
    case "name": q = q.order("name"); break;
    default: q = q.order("added_at", { ascending: false });
  }
  q = q.order("sku");
  const page = f.page ?? 1;
  const from = (page - 1) * pageSize;
  const { data, count, error } = await q.range(from, from + pageSize - 1);
  if (error) throw new Error(error.message);
  return { items: (data ?? []) as CardItem[], total: count ?? 0, page, pages: Math.max(1, Math.ceil((count ?? 0) / pageSize)) };
}

/** Values for the filter menus (collections and colours that actually exist). */
export const getFacets = cache(async (categorySlug?: string) => {
  const supabase = await createClient();
  let q = supabase.from("catalog").select("collection, colour, subcategory_name, subcategory_slug").limit(2000);
  if (categorySlug) q = q.eq("category_slug", categorySlug);
  const { data } = await q;
  const uniq = (xs: (string | null)[]) =>
    [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const types = new Map<string, string>();
  for (const r of data ?? []) if (r.subcategory_slug && r.subcategory_name) types.set(r.subcategory_slug, r.subcategory_name);
  return {
    collections: uniq((data ?? []).map((r) => r.collection)),
    colours: uniq((data ?? []).map((r) => r.colour)),
    types: [...types.entries()].map(([slug, name]) => ({ slug, name })),
  };
});

export async function getProduct(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalog")
    .select("id, sku, name, slug, category_id, category_name, category_slug, subcategory_name, subcategory_slug, description, price, mrp, collection, material, colour, size, design_number, tags, in_stock, stock_qty, image_paths, is_featured, added_at")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function getRelated(product: { id: string | null; category_id: string | null }, limit = 8) {
  if (!product.category_id || !product.id) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalog")
    .select(CARD_COLUMNS)
    .eq("category_id", product.category_id)
    .neq("id", product.id)
    .order("in_stock", { ascending: false })
    .order("added_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CardItem[];
}

export async function getHomeSections() {
  const supabase = await createClient();
  const [featured, latest] = await Promise.all([
    supabase.from("catalog").select(CARD_COLUMNS).eq("is_featured", true).order("added_at", { ascending: false }).limit(8),
    supabase.from("catalog").select(CARD_COLUMNS).eq("in_stock", true).order("added_at", { ascending: false }).limit(8),
  ]);
  return { featured: (featured.data ?? []) as CardItem[], latest: (latest.data ?? []) as CardItem[] };
}

/** Products by id (for the wishlist and bag pages, which keep ids on the device). */
export async function getByIds(ids: string[]) {
  const clean = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100);
  if (!clean.length) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("catalog").select(CARD_COLUMNS).in("id", clean);
  return (data ?? []) as CardItem[];
}
