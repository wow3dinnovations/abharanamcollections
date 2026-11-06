import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/** Razorpay (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
 *  Server secrets (Cloudflare → Worker → Settings → Variables and Secrets):
 *    RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET */

export function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  return keyId && secret ? { keyId, secret } : null;
}

function sameHex(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Create a Razorpay order for our order (amount in paise). */
export async function createRazorpayOrder(amountPaise: number, receipt: string, orderId: string) {
  const keys = razorpayKeys();
  if (!keys) throw new Error("Online payment is not set up yet. Please choose another payment option.");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Basic " + Buffer.from(`${keys.keyId}:${keys.secret}`).toString("base64"),
    },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes: { order_id: orderId, order_number: receipt } }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!res.ok || !body.id) throw new Error(`Razorpay: ${body.error?.description ?? `error ${res.status}`}`);
  return body.id;
}

/** The signature Razorpay's checkout returns after a successful payment. */
export function checkoutSignatureOk(rzpOrderId: string, paymentId: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(`${rzpOrderId}|${paymentId}`).digest("hex");
  return sameHex(expected, signature);
}

/** The X-Razorpay-Signature header of a webhook call. */
export function webhookSignatureOk(rawBody: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sameHex(expected, signature);
}
