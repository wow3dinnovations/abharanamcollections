"use server";

import { checkoutSignatureOk, createRazorpayOrder, razorpayKeys } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

type Order = { id: string; number: string; total: number; status: string; payment_method: string; payment_status: string;
  gateway_order_id: string | null; email: string; name: string; phone: string };

const UUID = /^[0-9a-f-]{36}$/i;

export async function loadPayOrder(id: string, token: string): Promise<Order | null> {
  if (!UUID.test(id) || !UUID.test(token)) return null;
  const { data } = await createAdminClient().rpc("order_for_payment", { p_order: id, p_token: token });
  return (data as Order | null) ?? null;
}

export type StartResult =
  | { ok: true; key: string; amount: number; rzpOrderId: string; number: string; prefill: { name: string; email: string; contact: string } }
  | { ok: false; error: string };

/** Make (or reuse) the Razorpay order for this order, for the checkout window. */
export async function startPayment(id: string, token: string): Promise<StartResult> {
  try {
    const o = await loadPayOrder(id, token);
    if (!o) return { ok: false, error: "Order not found." };
    if (o.payment_status === "paid") return { ok: false, error: "This order is already paid." };
    if (o.status !== "placed" || o.payment_method !== "razorpay") return { ok: false, error: "This order can't be paid online now." };
    const keys = razorpayKeys();
    if (!keys) return { ok: false, error: "Online payment is not set up yet. Please WhatsApp us." };
    const amount = Math.round(Number(o.total) * 100);
    let rzpOrderId = o.gateway_order_id;
    if (!rzpOrderId) {
      rzpOrderId = await createRazorpayOrder(amount, o.number, o.id);
      const { error } = await createAdminClient().rpc("order_set_gateway", { p_order: id, p_token: token, p_gateway_order: rzpOrderId });
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true, key: keys.keyId, amount, rzpOrderId, number: o.number, prefill: { name: o.name, email: o.email, contact: o.phone } };
  } catch (e) {
    console.error("startPayment", e);
    return { ok: false, error: "Could not open the payment just now. Please try again in a minute, or WhatsApp us." };
  }
}

/** Called by the checkout window after a successful payment. */
export async function confirmPayment(
  id: string,
  token: string,
  r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
): Promise<{ ok: boolean; error?: string }> {
  const keys = razorpayKeys();
  const o = await loadPayOrder(id, token);
  if (!keys || !o) return { ok: false, error: "Order not found." };
  if (o.gateway_order_id !== r.razorpay_order_id || !checkoutSignatureOk(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature, keys.secret)) {
    return { ok: false, error: "We could not confirm this payment. If money was taken, it will show on your order within a few minutes, or WhatsApp us." };
  }
  // The Razorpay order was created by us for exactly the order total.
  const { error } = await createAdminClient().rpc("order_mark_paid", {
    p_gateway_order: r.razorpay_order_id,
    p_payment_id: r.razorpay_payment_id,
    p_amount_paise: Math.round(Number(o.total) * 100),
    p_raw: { source: "checkout", ...r },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
