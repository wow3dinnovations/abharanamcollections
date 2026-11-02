"use server";

import { revalidatePath } from "next/cache";
import { check, requireAdmin, str } from "@/lib/admin";

const STATUSES = ["new", "contacted", "confirmed", "completed", "cancelled"] as const;

export async function updateEnquiry(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const status = str(form, "status") as (typeof STATUSES)[number];
  if (!STATUSES.includes(status)) throw new Error("Unknown status");
  check(await supabase.from("enquiries").update({ status, admin_note: str(form, "admin_note") || null }).eq("id", id));
  revalidatePath("/admin/enquiries");
  revalidatePath(`/admin/enquiries/${id}`);
}
