"use server";

import type { Json } from "@abh/db";
import { revalidatePath } from "next/cache";
import { bool, check, requireAdmin, str } from "@/lib/admin";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
  return { ok: false, error: msg || "Something went wrong. Please try again." };
}

/** Pages that show products or stock (the website too, because price and stock show there). */
function refreshAll() {
  revalidatePath("/shop-admin", "layout");
  revalidatePath("/", "layout");
}

// ------------------------------------------------------------------------------------------ products
export async function suggestCode(category: string, vendor: string, location: string) {
  const { supabase } = await requireAdmin();
  if (!category) return { sku: "", based_on: "", match: "" };
  const { data, error } = await supabase.rpc("shop_next_code", {
    p_category: category,
    p_vendor: vendor || undefined,
    p_location: location || undefined,
  });
  if (error) return { sku: "", based_on: "", match: "" };
  return data as { sku: string; based_on: string; match: string };
}

export type ProductInput = {
  id?: string;
  sku: string;
  name: string;
  category_id: string;
  subcategory_id: string;
  vendor_id: string;
  location_id: string;
  purchase_rate: string;
  multiplier: string;
  price: string;
  mrp: string;
  opening_qty?: string;
  purchase_date: string;
  invoice_no: string;
  rack: string;
  barcode: string;
  design_number: string;
  size: string;
  colour: string;
  material: string;
  collection: string;
  description: string;
  is_active: boolean;
};

export async function saveProduct(input: ProductInput): Promise<Result<{ id: string; sku: string }>> {
  try {
    const { supabase } = await requireAdmin();
    const price = Number(input.price);
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: "Enter the selling price." };
    const { data, error } = await supabase.rpc("shop_save_product", { p: input as unknown as Json });
    if (error) return fail(error);
    refreshAll();
    return { ok: true, id: data as string, sku: input.sku.trim().toUpperCase() };
  } catch (e) {
    return fail(e);
  }
}

/** After the browser uploaded a photo to the catalog bucket: make it the product's main photo. */
export async function setShopPhoto(productId: string, path: string): Promise<Result> {
  try {
    const { supabase } = await requireAdmin();
    if (!path.startsWith("shop/")) return { ok: false, error: "Wrong photo path." };
    const { data: p } = check(await supabase.from("products").select("image_paths").eq("id", productId).single());
    const paths = p?.image_paths ?? [];
    // The new photo replaces the main (first) photo; other photos stay.
    check(await supabase.from("products").update({ image_paths: [path, ...paths.slice(1)] }).eq("id", productId));
    if (paths[0] && paths[0] !== path && paths[0].startsWith("shop/")) await supabase.storage.from("catalog").remove([paths[0]]);
    refreshAll();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setStock(form: FormData) {
  const { supabase } = await requireAdmin();
  const qty = Number(str(form, "qty"));
  if (!Number.isInteger(qty) || qty < 0) throw new Error("Quantity must be 0 or more.");
  check(
    await supabase.rpc("shop_set_stock", {
      p_product: str(form, "product_id"),
      p_location: str(form, "location_id"),
      p_qty: qty,
      p_note: str(form, "note"),
    }),
  );
  refreshAll();
}

// ------------------------------------------------------------------------------------------ billing
/** have = pieces in stock over all locations (a bill sells from wherever the piece is). */
export type BillProduct = { id: string; sku: string; name: string; price: number; barcode: string | null; have: number };

/** Find a product by barcode or code (exact), else by name. */
export async function findForBill(term: string): Promise<BillProduct[]> {
  const { supabase } = await requireAdmin();
  const t = term.trim();
  if (!t) return [];
  const pick = "id, sku, name, price, shop_products(barcode), shop_stock(location_id, qty)";
  const exact = await supabase.from("shop_products").select("product_id").eq("barcode", t).limit(1);
  let rows;
  if (exact.data?.length) {
    rows = (await supabase.from("products").select(pick).eq("id", exact.data[0]!.product_id)).data;
  } else {
    rows = (await supabase.from("products").select(pick).ilike("sku", t.replace(/[%_\\]/g, "")).limit(1)).data;
    if (!rows?.length) {
      const q = t.replace(/[%_,()\\]/g, " ");
      rows = (await supabase.from("products").select(pick).or(`name.ilike.%${q}%,sku.ilike.%${q}%`).order("sku").limit(12)).data;
    }
  }
  return (rows ?? []).map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    price: Number(r.price),
    barcode: r.shop_products?.barcode ?? null,
    have: r.shop_stock.reduce((a, s) => a + s.qty, 0),
  }));
}

export type SaleInput = {
  customer_phone: string;
  customer_name: string;
  customer_email: string;
  customer_address: string;
  discount_type: "amount" | "percent";
  discount_value: string;
  payment_method: string;
  notes: string;
  items: { product_id: string; qty: number; price: number }[];
};

export async function createSale(input: SaleInput): Promise<Result<{ id: string; number: string }>> {
  try {
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase.rpc("shop_create_sale", { p: input as unknown as Json });
    if (error) return fail(error);
    refreshAll();
    const r = data as { id: string; number: string };
    return { ok: true, id: r.id, number: r.number };
  } catch (e) {
    return fail(e);
  }
}

export type PastBill = {
  id: string;
  number: string;
  created_at: string;
  total: number;
  discount: number;
  status: string;
  payment_method: string;
  items: { sku: string; name: string; qty: number; line_total: number }[];
};
export type CustomerLookup = {
  phone: string;
  customer: { id: string; name: string; email: string; address: string; created_at: string } | null;
  bills: PastBill[];
  bill_count: number;
  total_spent: number;
};

/** Same rule as the database (shop_clean_phone): digits only, without +91 or a leading 0. */
function cleanPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (/^91\d{10}$/.test(d)) return d.slice(2);
  if (/^0\d{10}$/.test(d)) return d.slice(1);
  return d;
}

/** Billing: the customer with this phone number and their latest bills. */
export async function findCustomer(phone: string): Promise<CustomerLookup> {
  const { supabase } = await requireAdmin();
  const p = cleanPhone(phone);
  const none = { phone: p, customer: null, bills: [], bill_count: 0, total_spent: 0 };
  if (!/^\d{7,15}$/.test(p)) return none;
  const { data: c } = await supabase.from("shop_customers").select("id, name, email, address, created_at").eq("phone", p).maybeSingle();
  if (!c) return none;
  const [{ data: bills }, { data: all }] = await Promise.all([
    supabase
      .from("shop_sales")
      .select("id, number, created_at, total, discount, status, payment_method, shop_sale_items(sku, name, qty, line_total)")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("shop_sales").select("total").eq("customer_id", c.id).eq("status", "paid"),
  ]);
  return {
    phone: p,
    customer: c,
    bills: (bills ?? []).map((b) => ({
      id: b.id,
      number: b.number,
      created_at: b.created_at,
      total: Number(b.total),
      discount: Number(b.discount),
      status: b.status,
      payment_method: b.payment_method,
      items: b.shop_sale_items.map((i) => ({ sku: i.sku, name: i.name, qty: i.qty, line_total: Number(i.line_total) })),
    })),
    bill_count: all?.length ?? 0,
    total_spent: (all ?? []).reduce((a, s) => a + Number(s.total), 0),
  };
}

export async function cancelSale(form: FormData) {
  const { supabase } = await requireAdmin();
  check(await supabase.rpc("shop_cancel_sale", { p_sale: str(form, "id") }));
  refreshAll();
}

// ------------------------------------------------------------------------------------------ setup
export async function saveVendor(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const row = { name: str(form, "name").slice(0, 120), phone: str(form, "phone").slice(0, 40), is_active: id ? bool(form, "is_active") : true };
  if (!row.name) throw new Error("Enter the vendor's name.");
  check(id ? await supabase.from("shop_vendors").update(row).eq("id", id) : await supabase.from("shop_vendors").insert(row));
  revalidatePath("/shop-admin", "layout");
}

export async function saveLocation(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const row = { name: str(form, "name").slice(0, 120), is_active: id ? bool(form, "is_active") : true };
  if (!row.name) throw new Error("Enter the location's name.");
  check(id ? await supabase.from("shop_locations").update(row).eq("id", id) : await supabase.from("shop_locations").insert(row));
  revalidatePath("/shop-admin", "layout");
}

export async function saveShopCategory(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const row = {
    name: str(form, "name").slice(0, 80),
    code: str(form, "code").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || null,
    is_active: id ? bool(form, "is_active") : true,
  };
  if (!row.name) throw new Error("Enter the category name.");
  check(id ? await supabase.from("categories").update(row).eq("id", id) : await supabase.from("categories").insert({ ...row, slug: "" }));
  refreshAll();
}

export async function saveShopSettings(form: FormData) {
  const { supabase } = await requireAdmin();
  const num = (k: string, min: number, max: number) => {
    const n = Number(str(form, k));
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${k.replaceAll("_", " ")} must be between ${min} and ${max}.`);
    return n;
  };
  check(
    await supabase
      .from("shop_settings")
      .update({
        default_multiplier: num("default_multiplier", 0.1, 100),
        tag_width_mm: num("tag_width_mm", 10, 120),
        tag_height_mm: num("tag_height_mm", 8, 120),
        bill_footer: str(form, "bill_footer").slice(0, 300),
      })
      .eq("id", 1),
  );
  revalidatePath("/shop-admin", "layout");
}

/** Tag size can also be changed on the print page. */
export async function saveTagSize(width: number, height: number): Promise<Result> {
  try {
    const { supabase } = await requireAdmin();
    if (!(width >= 10 && width <= 120 && height >= 8 && height <= 120)) return { ok: false, error: "Tag size out of range." };
    check(await supabase.from("shop_settings").update({ tag_width_mm: width, tag_height_mm: height }).eq("id", 1));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------------------------------ import
export type ImportCounts = {
  categories: number;
  subcategories: number;
  vendors: number;
  locations: number;
  products: number;
  skipped: number;
  skipped_codes: string[];
};

/** One part of the shop computer's data (the browser sends products in parts of a few hundred). */
export async function importChunk(payload: Record<string, unknown[]>): Promise<Result<{ counts: ImportCounts }>> {
  try {
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase.rpc("shop_import", { p: payload as unknown as Json });
    if (error) return fail(error);
    return { ok: true, counts: data as unknown as ImportCounts };
  } catch (e) {
    return fail(e);
  }
}

export async function importDone() {
  await requireAdmin();
  refreshAll();
}

/** Product id for each code, and whether it already has a photo (for matching photos named <code>.jpg). */
export async function productIdsForCodes(codes: string[]): Promise<Record<string, { id: string; hasPhoto: boolean }>> {
  const { supabase } = await requireAdmin();
  const out: Record<string, { id: string; hasPhoto: boolean }> = {};
  for (let i = 0; i < codes.length; i += 200) {
    const part = codes.slice(i, i + 200).map((c) => c.toUpperCase());
    const { data } = await supabase.from("products").select("id, sku, image_paths").in("sku", part);
    for (const r of data ?? []) out[r.sku.toUpperCase()] = { id: r.id, hasPhoto: r.image_paths.length > 0 };
  }
  return out;
}
