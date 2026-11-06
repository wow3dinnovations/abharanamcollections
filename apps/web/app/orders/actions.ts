"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function cancelMyOrder(form: FormData) {
  const id = String(form.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_order", { p_order: id });
  revalidatePath(`/orders/${id}`);
  redirect(`/orders/${id}${error ? `?error=${encodeURIComponent(error.message)}` : ""}`);
}
