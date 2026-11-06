"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { confirmPayment, startPayment } from "../actions";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window { Razorpay?: RazorpayCtor }
}

function loadCheckout(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Razorpay did not load")));
    s.onerror = () => reject(new Error("Could not reach Razorpay. Check your internet connection and try again."));
    document.body.appendChild(s);
  });
}

export function PayNow({ id, token, store, fromApp }: { id: string; token: string; store: string; fromApp: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const opened = useRef(false);

  const pay = async () => {
    setBusy(true);
    setMsg("");
    try {
      const start = await startPayment(id, token);
      if (!start.ok) throw new Error(start.error);
      const Razorpay = await loadCheckout();
      const rzp = new Razorpay({
        key: start.key,
        amount: start.amount,
        currency: "INR",
        name: store,
        description: `Order ${start.number}`,
        order_id: start.rzpOrderId,
        prefill: start.prefill,
        theme: { color: "#6b1d2a" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: RazorpayResponse) => {
          setMsg("Confirming your payment…");
          const res = await confirmPayment(id, token, r);
          if (res.ok) router.refresh();
          else {
            setMsg(res.error ?? "Payment could not be confirmed.");
            setBusy(false);
          }
        },
      });
      rzp.on("payment.failed", (r) => setMsg(r.error?.description ? `Payment failed: ${r.error.description}. You can try again.` : "Payment failed. You can try again."));
      rzp.open();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not start the payment.");
      setBusy(false);
    }
  };

  // Open the payment window straight away when the page opens.
  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      void pay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-6 space-y-3">
      <button onClick={pay} disabled={busy} className="w-full rounded-full bg-maroon py-3 font-semibold text-white hover:bg-maroon-dark disabled:opacity-60">
        {busy ? "Opening payment…" : "Pay now"}
      </button>
      {msg && <p className="text-sm text-red-800" role="alert">{msg}</p>}
      {!fromApp && <p className="text-xs text-muted">Paid already? The order updates within a few minutes. <a href={`/orders/${id}`} className="underline">See your order</a></p>}
    </div>
  );
}
