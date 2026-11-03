import "server-only";
import { requireAdmin } from "@/lib/admin";

export type Masters = Awaited<ReturnType<typeof getMasters>>;

/** Lists used by most shop pages: categories, sub-categories, vendors, locations and the shop settings. */
export async function getMasters() {
  const { supabase } = await requireAdmin();
  const [cats, subs, vendors, locations, settings] = await Promise.all([
    supabase.from("categories").select("id, name, code, is_active").order("sort_order").order("name"),
    supabase.from("subcategories").select("id, name, category_id, is_active").order("name"),
    supabase.from("shop_vendors").select("*").order("name"),
    supabase.from("shop_locations").select("*").order("name"),
    supabase.from("shop_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  return {
    categories: cats.data ?? [],
    subcategories: subs.data ?? [],
    vendors: vendors.data ?? [],
    locations: locations.data ?? [],
    settings: settings.data ?? { id: 1, default_multiplier: 2, tag_width_mm: 18, tag_height_mm: 12, bill_footer: "", updated_at: "" },
  };
}

/** The shop's name for tags and bills. */
export async function getStoreName() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("store_settings").select("store_name, phone, address").eq("id", 1).maybeSingle();
  return { name: data?.store_name ?? "Abharanam Collections", phone: data?.phone ?? "", address: data?.address ?? "" };
}

export function istDate(iso: string | null | undefined, withTime = true) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

/** Today's date in India as YYYY-MM-DD. */
export function istToday() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Start of a day in India, as an ISO time (for filtering by date). */
export function istDayStart(day: string) {
  return new Date(`${day}T00:00:00+05:30`).toISOString();
}

/** Safe text for an ilike search. */
export function searchTerm(q: string) {
  return q.replace(/[%_,()\\]/g, " ").trim();
}
