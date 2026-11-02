"use server";

import { normaliseIndianMobile } from "@abh/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveProfile(form: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");
  const rawPhone = String(form.get("phone") ?? "").trim();
  const phone = rawPhone ? normaliseIndianMobile(rawPhone) : null;
  if (rawPhone && !phone) redirect("/account?error=Enter+a+valid+10-digit+mobile+number");
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: String(form.get("full_name") ?? "").trim().slice(0, 80) || null,
      phone,
      city: String(form.get("city") ?? "").trim().slice(0, 80) || null,
    })
    .eq("id", user.id);
  if (error) redirect(`/account?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/account");
  redirect("/account?saved=1");
}
