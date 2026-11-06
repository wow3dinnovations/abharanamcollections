import { webhookSignatureOk } from "@/lib/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

/** Razorpay → Settings → Webhooks: https://1gram.abharanamcollections.com/api/razorpay/webhook
 *  Events: payment.captured, order.paid. Secret: the same value as RAZORPAY_WEBHOOK_SECRET.
 *  Marks the order paid even when the customer closed the browser before returning to the site. */
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return new Response("webhook not set up", { status: 503 });
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!webhookSignatureOk(raw, sig, secret)) return new Response("bad signature", { status: 400 });

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const p = event.payload?.payment?.entity;
  if ((event.event === "payment.captured" || event.event === "order.paid") && p?.id && p.order_id && typeof p.amount === "number") {
    const { error } = await createAdminClient().rpc("order_mark_paid", {
      p_gateway_order: p.order_id,
      p_payment_id: p.id,
      p_amount_paise: p.amount,
      p_raw: { source: "webhook", event: event.event, status: p.status ?? null },
    });
    if (error) return new Response(error.message, { status: 500 }); // Razorpay retries later
  }
  return new Response("ok");
}
