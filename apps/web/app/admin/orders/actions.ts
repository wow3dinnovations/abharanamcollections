"use server";

import type { OrderStatus, PaymentStatus } from "@abh/core";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, str } from "@/lib/admin";

const STATUSES: OrderStatus[] = ["placed", "confirmed", "packed", "shipped", "delivered", "cancelled"];
const PAYMENTS: PaymentStatus[] = ["pending", "paid", "failed", "refunded"];

export async function updateOrder(form: FormData) {
  const { supabase } = await requireAdmin();
  const id = str(form, "id");
  const status = str(form, "status") as OrderStatus;
  const payment = str(form, "payment_status") as PaymentStatus;
  const { error } = await supabase.rpc("admin_update_order", {
    p_order: id,
    p_status: STATUSES.includes(status) ? status : undefined,
    p_payment: PAYMENTS.includes(payment) ? payment : undefined,
    p_tracking: str(form, "tracking"),
    p_note: String(form.get("admin_note") ?? ""),
  });
  revalidatePath("/admin/orders");
  revalidatePath("/", "layout");
  redirect(`/admin/orders/${id}?${error ? `error=${encodeURIComponent(error.message)}` : "saved=1"}`);
}
