/** Online orders: shared by the website and the app. */

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
] as const;

export type PaymentMethod = "razorpay" | "upi_manual" | "cod";
export type OrderStatus = "placed" | "confirmed" | "packed" | "shipped" | "delivered" | "cancelled";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  razorpay: "Pay online (UPI, cards, netbanking)",
  upi_manual: "UPI to our account",
  cod: "Cash on delivery",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Order placed",
  confirmed: "Confirmed",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Payment pending",
  paid: "Paid",
  failed: "Not paid",
  refunded: "Refunded",
};

export function isPincode(s: string): boolean {
  return /^[1-9][0-9]{5}$/.test(s.trim());
}

/** Delivery charge the database will apply (shown before the order is placed). */
export function shippingFor(subtotal: number, fee: number, freeAbove: number): number {
  return freeAbove > 0 && subtotal >= freeAbove ? 0 : fee;
}

/** UPI deep link that opens the customer's UPI app with the amount filled in. */
export function upiLink(upiId: string, payee: string, amount: number, note: string): string {
  // encodeURIComponent, not URLSearchParams: some UPI apps show "+" instead of spaces, or reject "%40" in the UPI ID.
  const q = { pa: upiId.trim(), pn: payee, am: amount.toFixed(2), cu: "INR", tn: note };
  return `upi://pay?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%40/g, "@")}`).join("&")}`;
}

type OrderState = { status: string; payment_status: string; payment_method: string };

/** An online-payment order that is not paid yet is not a real order: show it as waiting for payment. */
export function awaitingPayment(o: OrderState): boolean {
  return o.status === "placed" && o.payment_method !== "cod" && o.payment_status !== "paid";
}

/** One status word for lists: "Awaiting payment" until paid, then the order status. */
export function orderStageLabel(o: OrderState): string {
  return awaitingPayment(o) ? "Awaiting payment" : ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status;
}
