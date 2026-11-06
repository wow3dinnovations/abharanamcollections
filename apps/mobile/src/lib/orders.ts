import { SITE_URL } from "./supabase";

export const ORDER_COLUMNS =
  "id, number, status, payment_method, payment_status, subtotal, shipping_fee, total, shipping_address, customer_notes, tracking, pay_token, created_at" as const;

/** Online payment happens on the website's secure payment page (Razorpay); it brings the customer back here. */
export function payUrl(id: string, token: string) {
  return `${SITE_URL}/pay/${id}?t=${token}&app=1`;
}
