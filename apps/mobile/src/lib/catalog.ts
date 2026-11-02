import { PAGE_SIZE, priceBand, searchTerms, type ShopFilters } from "@abh/core";
import type { Tables } from "@abh/db";
import { supabase } from "./supabase";

export const CARD_COLUMNS =
  "id, sku, name, slug, category_name, category_slug, price, mrp, in_stock, stock_qty, image_paths, is_featured";

export type CardItem = Pick<
  Tables<"catalog">,
  "id" | "sku" | "name" | "slug" | "category_name" | "category_slug" | "price" | "mrp" | "in_stock" | "stock_qty" | "image_paths" | "is_featured"
>;

export async function getSettings() {
  const { data } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
  return data;
}

export async function getCategories() {
  const { data, error } = await supabase.from("category_summary").select("*").order("sort_order").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listProducts(f: ShopFilters) {
  let q = supabase.from("catalog").select(CARD_COLUMNS, { count: "exact" });
  if (f.category) q = q.eq("category_slug", f.category);
  if (f.inStock) q = q.eq("in_stock", true);
  const band = priceBand(f.price);
  if (band?.min != null) q = q.gte("price", band.min);
  if (band?.max != null) q = q.lte("price", band.max);
  const terms = f.q ? searchTerms(f.q) : null;
  if (terms) q = q.textSearch("search", terms, { config: "simple" });
  if (f.sort === "price_asc") q = q.order("price", { ascending: true });
  else if (f.sort === "price_desc") q = q.order("price", { ascending: false });
  else if (f.sort === "name") q = q.order("name");
  else q = q.order("added_at", { ascending: false });
  q = q.order("sku");
  const page = f.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await q.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { items: (data ?? []) as CardItem[], total: count ?? 0 };
}
