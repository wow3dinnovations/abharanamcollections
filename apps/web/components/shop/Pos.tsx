"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createSale, findForBill, type BillProduct } from "@/app/shop-admin/actions";
import { Button, Card, Field, Input, Select } from "@/components/admin/ui";

type Line = BillProduct & { qty: number; sell: number };
const LOC_KEY = "abh.shop.pos-location";
const money = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function Pos({ locations }: { locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<BillProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [discount, setDiscount] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [payment, setPayment] = useState("cash");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const scan = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOC_KEY);
      setLocation(saved && locations.some((l) => l.id === saved) ? saved : (locations[0]?.id ?? ""));
    } catch {
      setLocation(locations[0]?.id ?? "");
    }
  }, [locations]);

  const add = (p: BillProduct) => {
    setLines((l) =>
      l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? { ...x, qty: x.qty + 1 } : x)) : [...l, { ...p, qty: 1, sell: p.price }],
    );
    setFound([]);
    setTerm("");
    scan.current?.focus();
  };

  const lookup = () =>
    start(async () => {
      setMsg("");
      const r = await findForBill(term, location);
      if (r.length === 1) add(r[0]!);
      else if (!r.length) setMsg(`Nothing found for "${term}".`);
      else setFound(r);
    });

  const subtotal = lines.reduce((a, l) => a + l.qty * l.sell, 0);
  const disc = Number(discount) || 0;
  const total = Math.max(0, subtotal - disc);

  const save = () =>
    start(async () => {
      setMsg("");
      const res = await createSale({
        location_id: location,
        customer_name: customer.name,
        customer_phone: customer.phone,
        discount: String(disc),
        payment_method: payment,
        notes,
        items: lines.map((l) => ({ product_id: l.id, qty: l.qty, price: l.sell })),
      });
      if (!res.ok) setMsg(res.error);
      else router.push(`/shop-admin/sales/${res.id}?print=1`);
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Shop">
            <Select value={location} onChange={(e) => { setLocation(e.target.value); try { localStorage.setItem(LOC_KEY, e.target.value); } catch {} }}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <form onSubmit={(e) => { e.preventDefault(); if (term.trim()) lookup(); }} className="flex flex-1 gap-2">
            <Input ref={scan} autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Scan barcode or type code / name" className="flex-1" />
            <Button variant="secondary" disabled={pending}>Add</Button>
          </form>
        </div>
        {msg && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800" role="alert">{msg}</p>}
        {found.length > 0 && (
          <ul className="divide-y rounded border border-cream bg-white text-sm">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex w-full justify-between px-3 py-2 text-left hover:bg-cream">
                  <span><b>{p.sku}</b> {p.name}</span>
                  <span>{money(p.price)} · {p.have} here</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Card>
          {!lines.length && <p className="text-sm text-muted">Scan a tag to start the bill.</p>}
          <ul className="divide-y divide-stone-100">
            {lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="w-28 font-mono font-medium">{l.sku}</span>
                <span className="min-w-24 flex-1">{l.name}{l.qty > l.have && <span className="ml-2 text-xs text-red-700">only {l.have} in stock here</span>}</span>
                <Input type="number" min="1" value={l.qty} aria-label="Quantity" className="w-16"
                  onChange={(e) => setLines((x) => x.map((y) => (y.id === l.id ? { ...y, qty: Math.max(1, Number(e.target.value) || 1) } : y)))} />
                <span>×</span>
                <Input type="number" min="0" value={l.sell} aria-label="Price" className="w-24"
                  onChange={(e) => setLines((x) => x.map((y) => (y.id === l.id ? { ...y, sell: Math.max(0, Number(e.target.value) || 0) } : y)))} />
                <span className="w-20 text-right font-medium">{money(l.qty * l.sell)}</span>
                <button type="button" className="text-xs text-red-700 underline" onClick={() => setLines((x) => x.filter((y) => y.id !== l.id))}>Remove</button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Bill">
        <div className="space-y-3">
          <Field label="Customer name"><Input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
          <Field label="Phone"><Input inputMode="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></Field>
          <Field label="Payment">
            <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Discount (₹)"><Input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
          <Field label="Note"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <dl className="grid grid-cols-2 gap-1 border-t border-cream pt-3 text-sm">
            <dt className="text-muted">Items</dt><dd className="text-right">{lines.reduce((a, l) => a + l.qty, 0)}</dd>
            <dt className="text-muted">Subtotal</dt><dd className="text-right">{money(subtotal)}</dd>
            <dt className="text-muted">Discount</dt><dd className="text-right">{money(disc)}</dd>
            <dt className="text-lg font-semibold">Total</dt><dd className="text-right text-lg font-semibold">{money(total)}</dd>
          </dl>
          <Button type="button" className="w-full py-2.5" disabled={pending || !lines.length || !location} onClick={save}>
            {pending ? "Saving…" : "Save & print bill"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
