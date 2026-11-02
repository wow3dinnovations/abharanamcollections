"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bool, check, requireAdmin, str } from "@/lib/admin";

export async function saveSettings(form: FormData) {
  const { supabase } = await requireAdmin();
  const whatsapp = str(form, "whatsapp_number").replace(/[^0-9]/g, "");
  if (whatsapp && whatsapp.length < 11) redirect("/admin/settings?error=WhatsApp+number+must+include+the+country+code,+e.g.+919876543210");
  const insta = str(form, "instagram_url");
  if (insta && !/^https:\/\//.test(insta)) redirect("/admin/settings?error=Instagram+link+must+start+with+https://");
  check(
    await supabase
      .from("store_settings")
      .update({
        store_name: str(form, "store_name") || "Abharanam Collections",
        tagline: str(form, "tagline"),
        whatsapp_number: whatsapp,
        phone: str(form, "phone"),
        email: str(form, "email"),
        address: str(form, "address"),
        instagram_url: insta,
        announcement: str(form, "announcement").slice(0, 160),
        show_prices: bool(form, "show_prices"),
        show_stock_count: bool(form, "show_stock_count"),
        enquiries_open: bool(form, "enquiries_open"),
      })
      .eq("id", 1),
  );
  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}
