"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createSale, findCustomer, findForBill, type BillProduct, type CustomerLookup } from "@/app/shop-admin/actions";
import { Button, Card, Field, Input, Select } from "@/components/admin/ui";

type Line = BillProduct & { qty: number; sell: number };
const money = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
const PAY: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", other: "Other" };
const emptyCustomer = { phone: "", name: "", email: "", address: "" };

export function Pos() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<BillProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [dtype, setDtype] = useState<"percent" | "amount">("percent");
  const [dvalue, setDvalue] = useState("");
  const [customer, setCustomer] = useState(emptyCustomer);
  const [known, setKnown] = useState<CustomerLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [openBill, setOpenBill] = useState("");
  const [payment, setPayment] = useState("cash");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const scan = useRef<HTMLInputElement>(null);

  // Typing a phone number brings up the customer and their past bills.
  const digits = customer.phone.replace(/\D/g, "");
  useEffect(() => {
    setKnown(null);
    setOpenBill("");
    if (digits.length < 7 || digits.length > 15) return;
    let live = true;
    setLooking(true);
    const t = setTimeout(() => {
      findCustomer(digits)
        .then((r) => { if (live) setKnown(r); })
        .catch(() => {})
        .finally(() => { if (live) setLooking(false); });
    }, 350);
    return () => { live = false; clearTimeout(t); setLooking(false); };
  }, [digits]);
  const existing = known?.customer ?? null;

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
      const r = await findForBill(term);
      if (r.length === 1) add(r[0]!);
      else if (!r.length) setMsg(`Nothing found for "${term}".`);
      else setFound(r);
    });

  const subtotal = r2(lines.reduce((a, l) => a + l.qty * l.sell, 0));
  const dv = Number(dvalue) || 0;
  const discRaw = dtype === "percent" ? r2((subtotal * dv) / 100) : r2(dv);
  const discBad = dv < 0 || (dtype === "percent" && dv > 100) || discRaw > subtotal;
  const disc = discBad ? 0 : discRaw;
  const total = r2(subtotal - disc);

  const save = () =>
    start(async () => {
      setMsg("");
      const res = await createSale({
        customer_phone: customer.phone,
        customer_name: existing && !customer.name.trim() ? existing.name : customer.name,
        customer_email: customer.email,
        customer_address: customer.address,
        discount_type: dtype,
        discount_value: disc > 0 ? String(dv) : "0",
        payment_method: payment,
        notes,
        items: lines.map((l) => ({ product_id: l.id, qty: l.qty, price: l.sell })),
      });
      if (!res.ok) setMsg(res.error);
      else router.push(`/shop-admin/sales/${res.id}?print=1`);
    });

  const tab = (on: boolean) => `px-3 py-1.5 text-sm font-medium ${on ? "bg-maroon text-white" : "bg-white hover:bg-stone-100"}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); if (term.trim()) lookup(); }} className="flex gap-2">
          <Input ref={scan} autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Scan barcode or type code / name" className="flex-1" />
          <Button variant="secondary" disabled={pending}>Add</Button>
        </form>
        {msg && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800" role="alert">{msg}</p>}
        {found.length > 0 && (
          <ul className="divide-y rounded border border-cream bg-white text-sm">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="flex w-full justify-between px-3 py-2 text-left hover:bg-cream">
                  <span><b>{p.sku}</b> {p.name}</span>
                  <span>{money(p.price)} · {p.have} in stock</span>
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
                <span className="min-w-24 flex-1">{l.name}{l.qty > l.have && <span className="ml-2 text-xs text-red-700">only {l.have} in stock</span>}</span>
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

      <div className="space-y-4">
        <Card title="Customer details">
          <div className="space-y-3">
            <Field label="Phone number">
              <Input type="tel" inputMode="tel" value={customer.phone} placeholder="Type to find the customer"
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="text-base" />
            </Field>
            {looking && <p className="text-xs text-muted">Looking up…</p>}
            {existing && known ? (
              <div className="rounded-lg bg-cream/60 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-base">{existing.name || "No name saved"}</b>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Existing customer</span>
                </div>
                {(existing.email || existing.address) && <p className="text-xs text-muted">{[existing.email, existing.address].filter(Boolean).join(" · ")}</p>}
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded bg-white p-1.5"><dt className="text-muted">Bills</dt><dd className="font-semibold">{known.bill_count}</dd></div>
                  <div className="rounded bg-white p-1.5"><dt className="text-muted">Spent</dt><dd className="font-semibold">{money(known.total_spent)}</dd></div>
                  <div className="rounded bg-white p-1.5"><dt className="text-muted">Last visit</dt><dd className="font-semibold">{known.bills[0] ? day(known.bills[0].created_at) : "–"}</dd></div>
                </dl>
                {known.bills.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-medium uppercase text-maroon">Past bills</p>
                    <ul className="max-h-72 space-y-1 overflow-y-auto">
                      {known.bills.map((b) => (
                        <li key={b.id} className="rounded border border-cream bg-white">
                          <button type="button" className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs" onClick={() => setOpenBill(openBill === b.id ? "" : b.id)}>
                            <span><b>{b.number}</b> <span className="text-muted">{day(b.created_at)} · {b.items.reduce((a, i) => a + i.qty, 0)} pcs</span></span>
                            <span className={b.status === "cancelled" ? "text-red-700 line-through" : ""}>{money(b.total)}</span>
                          </button>
                          {openBill === b.id && (
                            <div className="border-t border-cream px-2 py-1.5 text-xs">
                              {b.items.map((it, k) => (
                                <div key={k} className="flex justify-between gap-2"><span>{it.name} <span className="text-muted">{it.sku}</span> × {it.qty}</span><span>{money(it.line_total)}</span></div>
                              ))}
                              {b.discount > 0 && <div className="flex justify-between text-red-700"><span>Discount</span><span>− {money(b.discount)}</span></div>}
                              <div className="mt-1 flex justify-between text-muted">
                                <span>{PAY[b.payment_method] ?? b.payment_method}{b.status === "cancelled" ? " · cancelled" : ""}</span>
                                <Link href={`/shop-admin/sales/${b.id}`} className="text-maroon underline">Open bill</Link>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-maroon">Change name / details</summary>
                  <div className="mt-2 grid gap-2">
                    <Input placeholder={existing.name || "Name"} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                    <Input placeholder={existing.email || "Email"} value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
                    <Input placeholder={existing.address || "Address / area"} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
                  </div>
                </details>
              </div>
            ) : (
              <>
                {known && !known.customer && <p className="rounded bg-cream/60 px-3 py-2 text-xs">New customer. They will be saved with this bill.</p>}
                <Field label="Name"><Input value={customer.name} placeholder={digits ? "Customer name" : "Leave blank for walk-in"} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></Field>
                {digits.length > 0 && (
                  <div className="grid gap-2">
                    <Input placeholder="Email (optional)" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
                    <Input placeholder="Address / area (optional)" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
                  </div>
                )}
              </>
            )}
            {(customer.phone || customer.name) && (
              <button type="button" className="text-xs text-muted underline" onClick={() => setCustomer(emptyCustomer)}>Clear customer</button>
            )}
          </div>
        </Card>

        <Card title="Bill">
          <div className="space-y-3">
            <Field label="Payment">
              <Select value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <div className="text-xs text-stone-600">
              Discount
              <div className="mt-1 grid grid-cols-2 overflow-hidden rounded border border-cream" role="radiogroup" aria-label="Discount type">
                <button type="button" role="radio" aria-checked={dtype === "percent"} className={tab(dtype === "percent")} onClick={() => setDtype("percent")}>Percentage (%)</button>
                <button type="button" role="radio" aria-checked={dtype === "amount"} className={`border-l border-cream ${tab(dtype === "amount")}`} onClick={() => setDtype("amount")}>Amount (₹)</button>
              </div>
              <Input type="number" min="0" step={dtype === "percent" ? "0.01" : "1"} value={dvalue} aria-label={dtype === "percent" ? "Discount percent" : "Discount amount"}
                placeholder={dtype === "percent" ? "e.g. 10 (%)" : "e.g. 150 (₹)"} onChange={(e) => setDvalue(e.target.value)} className="mt-2 w-full" />
              {disc > 0 && subtotal > 0 && (
                <p className="mt-1 text-muted">{dtype === "percent" ? `= ${money(disc)} off` : `= ${r2((disc * 100) / subtotal)}% of the bill`}</p>
              )}
              {discBad && dvalue !== "" && <p className="mt-1 text-red-700">Discount cannot be negative, over 100% or more than the bill.</p>}
            </div>
            <Field label="Note"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <dl className="grid grid-cols-2 gap-1 border-t border-cream pt-3 text-sm">
              <dt className="text-muted">Items</dt><dd className="text-right">{lines.reduce((a, l) => a + l.qty, 0)}</dd>
              <dt className="text-muted">Subtotal</dt><dd className="text-right">{money(subtotal)}</dd>
              <dt className="text-muted">Discount{disc > 0 && dtype === "percent" ? ` (${dv}%)` : ""}</dt><dd className="text-right">{disc > 0 ? `− ${money(disc)}` : money(0)}</dd>
              <dt className="text-lg font-semibold">Total</dt><dd className="text-right text-lg font-semibold">{money(total)}</dd>
            </dl>
            <Button type="button" className="w-full py-2.5" disabled={pending || !lines.length || discBad} onClick={save}>
              {pending ? "Saving…" : "Save & print bill"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
