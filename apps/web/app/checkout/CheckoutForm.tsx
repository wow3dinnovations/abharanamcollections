"use client";

import { INDIAN_STATES, PAYMENT_LABEL, rupees, shippingFor, type PaymentMethod } from "@abh/core";
import type { Tables } from "@abh/db";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ProductImage } from "@/components/ProductImage";
import { bag, useBag } from "@/lib/local";
import { createClient } from "@/lib/supabase/browser";
import { placeOrder, type NewAddress } from "./actions";

const HINT: Record<PaymentMethod, string> = {
  razorpay: "Pay now with any UPI app, debit/credit card or netbanking. Secure payment by Razorpay.",
  upi_manual: "After placing the order, pay our UPI ID. We confirm once we see the payment.",
  cod: "Pay in cash when the parcel arrives.",
};
const input = "w-full rounded border border-cream bg-ivory px-3 py-2 text-sm text-ink";

type Live = { id: string | null; price: number | null; image_paths: string[] | null; in_stock: boolean | null; stock_qty: number | null };

export function CheckoutForm({ methods, addresses, shippingFee, freeAbove, profile }: {
  methods: PaymentMethod[];
  addresses: Tables<"addresses">[];
  shippingFee: number;
  freeAbove: number;
  profile: { name: string; phone: string; city: string };
}) {
  const router = useRouter();
  const lines = useBag();
  const [live, setLive] = useState<Map<string, Live>>(new Map());
  const [addressId, setAddressId] = useState<string>(addresses[0]?.id ?? "new");
  const [addr, setAddr] = useState<NewAddress>({ full_name: profile.name, phone: profile.phone, line1: "", line2: "", city: profile.city, state: "", pincode: "" });
  const [method, setMethod] = useState<PaymentMethod>(methods[0]!);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [placed, setPlaced] = useState(false);

  const ids = lines.map((l) => l.productId).join(",");
  useEffect(() => {
    if (!ids) return;
    createClient()
      .from("catalog")
      .select("id, price, image_paths, in_stock, stock_qty")
      .in("id", ids.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)))
      .then(({ data }) => setLive(new Map((data ?? []).map((r): [string, Live] => [r.id ?? "", r]))));
  }, [ids]);

  if (!lines.length && !placed) {
    return (
      <p className="rounded-xl border border-cream bg-white p-8 text-center">
        Your bag is empty. <Link href="/shop" className="text-maroon underline">Start browsing</Link>
      </p>
    );
  }

  const priced = lines.map((l) => ({ ...l, price: Number(live.get(l.productId)?.price ?? l.price) }));
  const subtotal = priced.reduce((a, l) => a + l.price * l.quantity, 0);
  const shipping = shippingFor(subtotal, shippingFee, freeAbove);
  const soldOut = priced.filter((l) => {
    const p = live.get(l.productId);
    return p && (!p.in_stock || (p.stock_qty ?? 0) < l.quantity);
  });

  const submit = () => {
    setError("");
    start(async () => {
      const res = await placeOrder({
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        addressId,
        address: addressId === "new" ? addr : undefined,
        method,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPlaced(true);
      bag.clear();
      router.push(res.method === "razorpay" ? `/pay/${res.id}?t=${res.token}` : `/orders/${res.id}?placed=1`);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-8 lg:grid-cols-[1fr_380px]"
    >
      <div className="space-y-6">
        <section className="space-y-3 rounded-xl border border-cream bg-white p-5">
          <h2 className="text-xl font-semibold">Delivery address</h2>
          {addresses.map((a) => (
            <label key={a.id} className="flex gap-3 rounded border border-cream p-3 text-sm has-[:checked]:border-maroon">
              <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
              <span>
                <strong>{a.full_name}</strong> · {a.phone}
                <br />
                {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode}
              </span>
            </label>
          ))}
          <div className="rounded border border-cream p-3 has-[:checked]:border-maroon">
            <label className="flex items-center gap-3 text-sm">
              <input type="radio" name="address" checked={addressId === "new"} onChange={() => setAddressId("new")} /> {addresses.length ? "Use a new address" : "Address"}
            </label>
            {addressId === "new" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input required placeholder="Full name" autoComplete="name" value={addr.full_name} onChange={(e) => setAddr({ ...addr, full_name: e.target.value })} className={input} aria-label="Full name" />
                <input required placeholder="Mobile number" inputMode="tel" autoComplete="tel" value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} className={input} aria-label="Mobile number" />
                <input required placeholder="House no., street" autoComplete="address-line1" value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} className={`${input} sm:col-span-2`} aria-label="House number and street" />
                <input placeholder="Area, landmark (optional)" autoComplete="address-line2" value={addr.line2} onChange={(e) => setAddr({ ...addr, line2: e.target.value })} className={`${input} sm:col-span-2`} aria-label="Area or landmark" />
                <input required placeholder="City / town" autoComplete="address-level2" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} className={input} aria-label="City" />
                <select required value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} className={input} aria-label="State">
                  <option value="" disabled>State</option>
                  {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <input required placeholder="PIN code" inputMode="numeric" maxLength={6} autoComplete="postal-code" value={addr.pincode} onChange={(e) => setAddr({ ...addr, pincode: e.target.value })} className={input} aria-label="PIN code" />
              </div>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-cream bg-white p-5">
          <h2 className="text-xl font-semibold">Payment</h2>
          {methods.map((m) => (
            <label key={m} className="flex gap-3 rounded border border-cream p-3 text-sm has-[:checked]:border-maroon">
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
              <span>
                <strong>{PAYMENT_LABEL[m]}</strong>
                <br />
                <span className="text-muted">{HINT[m]}</span>
              </span>
            </label>
          ))}
        </section>

        <section className="rounded-xl border border-cream bg-white p-5">
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Note for us (optional)
            <textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gift wrap, delivery date…" className={input} />
          </label>
        </section>
      </div>

      <aside className="h-fit space-y-3 rounded-xl border border-cream bg-white p-5 text-sm">
        <h2 className="text-xl font-semibold">Your order</h2>
        <ul className="space-y-3">
          {priced.map((l) => (
            <li key={l.productId} className="flex gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded border border-cream">
                <ProductImage path={live.get(l.productId)?.image_paths?.[0]} alt="" />
              </div>
              <div className="flex-1">
                <p>{l.name} × {l.quantity}</p>
                <p className="text-xs text-muted">Design {l.sku}</p>
              </div>
              <span>{rupees(l.price * l.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="gold-rule" />
        <div className="flex justify-between"><span>Items</span><span>{rupees(subtotal)}</span></div>
        <div className="flex justify-between"><span>Delivery</span><span>{shipping ? rupees(shipping) : "Free"}</span></div>
        {freeAbove > 0 && shipping > 0 && <p className="text-xs text-muted">Free delivery on orders of {rupees(freeAbove)} or more.</p>}
        <div className="flex justify-between text-lg font-semibold text-maroon"><span>Total</span><span>{rupees(subtotal + shipping)}</span></div>
        {soldOut.length > 0 && (
          <p className="rounded bg-amber-50 p-2 text-amber-900">
            Not enough stock now: {soldOut.map((l) => l.name).join(", ")}. <Link href="/bag" className="underline">Change your bag</Link>.
          </p>
        )}
        {error && <p className="rounded bg-red-50 p-2 text-red-800" role="alert">{error}</p>}
        <button disabled={pending || placed || soldOut.length > 0} className="w-full rounded-full bg-maroon py-3 font-semibold text-white hover:bg-maroon-dark disabled:opacity-50">
          {pending || placed ? "Placing order…" : method === "razorpay" ? `Place order & pay ${rupees(subtotal + shipping)}` : "Place order"}
        </button>
        <p className="text-xs text-muted">
          By placing the order you agree to our <Link href="/terms" className="underline">terms</Link>,{" "}
          <Link href="/shipping-policy" className="underline">shipping</Link> and <Link href="/returns" className="underline">returns</Link> policies.
        </p>
      </aside>
    </form>
  );
}
