"use server";

import type { Json } from "@abh/db";
import { revalidatePath } from "next/cache";
import { bool, check, requireAdmin, str } from "@/lib/admin";
import { readLayout } from "@/lib/shop/tags";

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
export type CodeSuggestion = { sku: string; based_on: string; match: string; serial: number | null };

/** Next product code: from the code scheme (IB850G) when the vendor has a number, else following the last code. */
export async function suggestCode(category: string, vendor: string, location: string, guarantee = false): Promise<CodeSuggestion> {
  const { supabase } = await requireAdmin();
  const none = { sku: "", based_on: "", match: "", serial: null };
  if (!category && !vendor) return none;
  const { data, error } = await supabase.rpc("shop_suggest_code", {
    p_category: category || undefined,
    p_vendor: vendor || undefined,
    p_location: location || undefined,
    p_guarantee: guarantee,
  });
  if (error || !data) return none;
  const r = data as { sku?: string; based_on?: string; match?: string; serial?: number | null };
  return { sku: r.sku ?? "", based_on: r.based_on ?? "", match: r.match ?? "", serial: r.serial ?? null };
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
  /** Months of manufacturer guarantee (0 = none). Adds the G to scheme codes. */
  guarantee_months: string;
  /** The serial number when the code came from the scheme, so the next product gets the next one. */
  code_serial?: number | null;
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
export type BillProduct = { id: string; sku: string; name: string; price: number; barcode: string | null; have: number };

/** Find a product by barcode or code (exact), else by name. */
export async function findForBill(term: string, location: string): Promise<BillProduct[]> {
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
    have: r.shop_stock.find((s) => s.location_id === location)?.qty ?? 0,
  }));
}

export type SaleInput = {
  location_id: string;
  customer_name: string;
  customer_phone: string;
  discount: string;
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

export async function cancelSale(form: FormData) {
  const { supabase } = await requireAdmin();
  check(await supabase.rpc("shop_cancel_sale", { p_sale: str(form, "id") }));
  refreshAll();
}

// ------------------------------------------------------------------------------------------ setup
export async function saveVendor(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const location_id = str(form, "location_id") || null;
  const int = (k: string, min: number, max: number) => {
    const raw = str(form, k);
    if (raw === "") return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${k === "code_no" ? "Vendor number" : "Next serial"} must be a whole number from ${min} to ${max}.`);
    return n;
  };
  let code_no = int("code_no", 0, 9999);
  // New vendor in a city: give it the next number there (8 vendors in Bangalore -> the new one is 9).
  if (!id && code_no === null && location_id) {
    const { data } = await supabase.rpc("shop_next_vendor_no", { p_location: location_id });
    code_no = typeof data === "number" ? data : null;
  }
  const next_serial = int("next_serial", 0, 999999999);
  const row = {
    name: str(form, "name").slice(0, 120),
    phone: str(form, "phone").slice(0, 40),
    is_active: id ? bool(form, "is_active") : true,
    location_id,
    code_no,
    ...(next_serial !== null ? { next_serial } : {}),
  };
  if (!row.name) throw new Error("Enter the vendor's name.");
  check(id ? await supabase.from("shop_vendors").update(row).eq("id", id) : await supabase.from("shop_vendors").insert(row));
  revalidatePath("/shop-admin", "layout");
}

export async function saveLocation(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const row = {
    name: str(form, "name").slice(0, 120),
    code: str(form, "code").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) || null,
    is_active: id ? bool(form, "is_active") : true,
  };
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

/** How product codes are made, and the shop serial number. */
export async function saveCodeSettings(form: FormData) {
  const { supabase } = await requireAdmin();
  const letters = (k: string) => str(form, k).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  const whole = (k: string, label: string, min: number, max: number) => {
    const n = Number(str(form, k));
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
    return n;
  };
  const pattern = str(form, "code_pattern").toUpperCase().replace(/\s+/g, "");
  if (!pattern.includes("{SERIAL}")) throw new Error("The code pattern must have {SERIAL} in it.");
  if (pattern.length > 60 || /[^A-Z0-9{}_./-]/.test(pattern)) throw new Error("The code pattern can only have letters, numbers, - _ . / and the {PARTS}.");
  const unknown = (pattern.match(/\{[^}]*\}/g) ?? []).filter((t) => !["{TYPE}", "{LOC}", "{VENDOR}", "{SERIAL}", "{G}"].includes(t));
  if (unknown.length) throw new Error(`Unknown part ${unknown[0]} in the code pattern.`);
  check(
    await supabase
      .from("shop_settings")
      .update({
        code_pattern: pattern,
        code_type: letters("code_type"),
        guarantee_letter: letters("guarantee_letter"),
        guarantee_months: whole("guarantee_months", "Guarantee months", 0, 120),
        serial_scope: str(form, "serial_scope") === "shop" ? "shop" : "vendor",
        next_serial: whole("next_serial", "Shop serial number", 0, 999999999),
        serial_digits: whole("serial_digits", "Serial digits", 0, 9),
      })
      .eq("id", 1),
  );
  revalidatePath("/shop-admin", "layout");
}

/** Tag size and layout (positions, offsets, lines) are changed on the print page. */
export async function saveTagLayout(width: number, height: number, layout: unknown): Promise<Result> {
  try {
    const { supabase } = await requireAdmin();
    if (!(width >= 10 && width <= 120 && height >= 8 && height <= 120)) return { ok: false, error: "Tag size out of range." };
    const clean = readLayout(layout);
    check(
      await supabase
        .from("shop_settings")
        .update({ tag_width_mm: width, tag_height_mm: height, tag_layout: clean as unknown as Json })
        .eq("id", 1),
    );
    revalidatePath("/shop-admin/tags");
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
