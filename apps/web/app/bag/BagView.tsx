"use client";
import { bagTotal, enquiryMessage, rupees, whatsappLink, type BagLine } from "@abh/core";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { bag, useBag } from "@/lib/local";
import { createClient } from "@/lib/supabase/browser";
import { submitEnquiry, type EnquiryState } from "./actions";

type Live = { id: string; name: string; price: number; sku: string; slug: string; image_paths: string[]; in_stock: boolean | null; category_name: string | null };

export function BagView({ whatsapp, open, showPrices, profile }: {
  whatsapp: string;
  open: boolean;
  showPrices: boolean;
  profile: { name: string; phone: string; email: string; city: string } | null;
}) {
  const lines = useBag();
  const [live, setLive] = useState<Map<string, Live>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitEnquiry, { ok: false });
  const sentLines = useRef<BagLine[]>([]);

  const ids = lines.map((l) => l.productId).join(",");
  useEffect(() => {
    if (!ids) {
      setLoaded(true);
      return;
    }
    createClient()
      .from("catalog")
      .select("id, name, price, sku, slug, image_paths, in_stock, category_name")
      .in("id", ids.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)))
      .then(({ data }) => {
        const rows = (data ?? []).filter((r): r is Live => !!r.id);
        setLive(new Map(rows.map((r) => [r.id, r])));
        bag.refresh(rows.map((r) => ({ id: r.id, name: r.name, price: Number(r.price), sku: r.sku, slug: r.slug })));
        setLoaded(true);
      });
  }, [ids]);

  useEffect(() => {
    if (state.ok) bag.clear();
  }, [state]);

  if (state.ok) {
    const wa = whatsappLink(whatsapp, enquiryMessage({ lines: sentLines.current, number: state.number }));
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-cream bg-white p-8 text-center">
        <p className="font-display text-3xl font-semibold text-maroon">Thank you!</p>
        <p className="mt-2">Your enquiry <strong>{state.number}</strong> has been sent.</p>
        <p className="mt-1 text-sm text-muted">We&apos;ll call or WhatsApp you soon to confirm availability, delivery and payment.</p>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block rounded-full bg-green-700 px-6 py-3 text-sm font-semibold text-white">
            Also send it on WhatsApp
          </a>
        )}
        <p className="mt-6"><Link href="/shop" className="text-sm text-maroon underline">Continue browsing</Link></p>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="rounded-xl border border-cream bg-white p-10 text-center">
        <p className="font-display text-2xl text-maroon">Your enquiry bag is empty</p>
        <p className="mt-1 text-sm text-muted">Add the designs you like and send us one enquiry for all of them.</p>
        <Link href="/shop" className="mt-4 inline-block rounded-full bg-maroon px-5 py-2 text-sm text-white">Start browsing</Link>
      </div>
    );
  }

  const { count, total } = bagTotal(lines);
  const v = (!state.ok && state.values) || {};

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <ul className="h-fit divide-y divide-cream rounded-xl border border-cream bg-white">
        {lines.map((l) => {
          const p = live.get(l.productId);
          return (
            <li key={l.productId} className="flex gap-4 p-4">
              <Link href={`/products/${l.slug ?? p?.slug ?? ""}`} className="h-20 w-20 shrink-0 overflow-hidden rounded border border-cream">
                <ProductImage path={p?.image_paths?.[0]} alt={l.name} />
              </Link>
              <div className="flex flex-1 flex-col gap-1">
                <Link href={`/products/${l.slug ?? p?.slug ?? ""}`} className="font-medium hover:underline">{l.name}</Link>
                <p className="text-xs text-muted">Design {l.sku}{p && !p.in_stock && " · currently sold out"}</p>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <div className="flex items-center rounded-full border border-cream">
                    <button type="button" className="px-3 py-1" onClick={() => bag.setQty(l.productId, l.quantity - 1)} aria-label={`One less ${l.name}`}>−</button>
                    <span className="w-6 text-center text-sm">{l.quantity}</span>
                    <button type="button" className="px-3 py-1" onClick={() => bag.setQty(l.productId, l.quantity + 1)} aria-label={`One more ${l.name}`}>+</button>
                  </div>
                  {showPrices && <span className="font-semibold text-maroon">{rupees(l.price * l.quantity)}</span>}
                  <button type="button" className="text-xs text-muted underline" onClick={() => bag.setQty(l.productId, 0)}>Remove</button>
                </div>
              </div>
            </li>
          );
        })}
        {loaded && <li className="p-4 text-xs text-muted">Prices are checked again when you send the enquiry.</li>}
      </ul>

      <form
        action={(fd) => {
          sentLines.current = lines;
          fd.set("items", JSON.stringify(lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))));
          return action(fd);
        }}
        className="h-fit space-y-3 rounded-xl border border-cream bg-white p-5"
      >
        <div className="flex justify-between text-sm">
          <span>{count} {count === 1 ? "piece" : "pieces"}</span>
          {showPrices && <span className="text-lg font-semibold text-maroon">{rupees(total)}</span>}
        </div>
        <div className="gold-rule" />
        <p className="text-sm text-muted">Send your details and we&apos;ll confirm availability, delivery charges and payment on call or WhatsApp. No payment now.</p>
        <Field label="Your name" name="name" required defaultValue={v.name ?? profile?.name} autoComplete="name" />
        <Field label="Mobile number" name="phone" required type="tel" inputMode="tel" defaultValue={v.phone ?? profile?.phone} autoComplete="tel" placeholder="98765 43210" />
        <Field label="Email (optional)" name="email" type="email" defaultValue={v.email ?? profile?.email} autoComplete="email" />
        <Field label="City / town" name="city" defaultValue={v.city ?? profile?.city} autoComplete="address-level2" />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Message (optional)
          <textarea name="message" rows={3} maxLength={1000} defaultValue={v.message} placeholder="Occasion, delivery date, size…" className="rounded border border-cream bg-ivory px-3 py-2 text-sm text-ink" />
        </label>
        {!state.ok && state.error && <p className="rounded bg-red-50 p-2 text-sm text-red-800" role="alert">{state.error}</p>}
        <button disabled={pending || !open} className="w-full rounded-full bg-maroon py-3 text-sm font-semibold text-white hover:bg-maroon-dark disabled:opacity-50">
          {pending ? "Sending…" : open ? "Send enquiry" : "Enquiries are paused – please WhatsApp us"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input {...props} maxLength={props.maxLength ?? 80} className="rounded border border-cream bg-ivory px-3 py-2 text-sm text-ink" />
    </label>
  );
}
