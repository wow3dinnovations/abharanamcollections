"use server";

import { isPincode, MAX_LINES, MAX_QTY, normaliseIndianMobile, type PaymentMethod } from "@abh/core";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type NewAddress = { full_name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string };
export type CheckoutInput = {
  items: { productId: string; quantity: number }[];
  addressId: string | "new";
  address?: NewAddress;
  method: PaymentMethod;
  notes: string;
};
export type CheckoutResult = { ok: true; id: string; token: string; method: PaymentMethod } | { ok: false; error: string };

export async function placeOrder(input: CheckoutInput): Promise<CheckoutResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again to place the order." };

  let addressId = input.addressId;
  if (addressId === "new") {
    const a = input.address;
    const phone = normaliseIndianMobile(a?.phone ?? "");
    if (!a || a.full_name.trim().length < 2) return { ok: false, error: "Please enter the name for delivery." };
    if (!phone) return { ok: false, error: "Please enter a valid 10-digit mobile number." };
    if (a.line1.trim().length < 3 || a.city.trim().length < 2 || !a.state) return { ok: false, error: "Please fill in the address, city and state." };
    if (!isPincode(a.pincode)) return { ok: false, error: "Please enter a valid 6-digit PIN code." };
    const { data, error } = await supabase
      .from("addresses")
      .insert({
        full_name: a.full_name.trim().slice(0, 80), phone: phone.slice(-10), line1: a.line1.trim().slice(0, 200),
        line2: a.line2.trim().slice(0, 200), city: a.city.trim().slice(0, 80), state: a.state, pincode: a.pincode.trim(),
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not save the address." };
    addressId = data.id;
  }

  const items = input.items.slice(0, MAX_LINES).map((l) => ({
    product_id: String(l.productId),
    quantity: Math.max(1, Math.min(MAX_QTY, Math.floor(Number(l.quantity) || 1))),
  }));
  const { data, error } = await supabase.rpc("place_order", {
    p_items: items,
    p_address_id: addressId,
    p_method: input.method,
    p_notes: input.notes.slice(0, 500),
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: "Could not place the order. Please try again." };
  revalidatePath("/", "layout");
  return { ok: true, id: row.id, token: row.pay_token, method: input.method };
}
