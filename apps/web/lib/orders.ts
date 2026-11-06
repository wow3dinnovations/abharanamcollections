/** Columns of orders a customer may read (the admin's private note is left out). */
export const ORDER_COLUMNS =
  "id, number, status, payment_method, payment_status, subtotal, shipping_fee, total, shipping_address, customer_notes, tracking, pay_token, paid_at, created_at" as const;

export type ShippingAddress = { full_name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string };

export const STATUS_TONE: Record<string, string> = {
  placed: "bg-cream text-ink",
  confirmed: "bg-blue-100 text-blue-900",
  packed: "bg-blue-100 text-blue-900",
  shipped: "bg-amber-100 text-amber-900",
  delivered: "bg-green-100 text-green-900",
  cancelled: "bg-stone-200 text-stone-600",
  paid: "bg-green-100 text-green-900",
  pending: "bg-amber-100 text-amber-900",
  failed: "bg-stone-200 text-stone-600",
  refunded: "bg-stone-200 text-stone-600",
};
