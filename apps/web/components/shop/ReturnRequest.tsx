"use client";

import { rupees } from "@abh/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestReturn } from "@/app/shop-admin/actions";
import { Button, Field, Input, Select } from "@/components/admin/ui";

type Item = { id: number; sku: string; name: string; qty: number; returned_qty: number; price: number };

/** On a bill: ask to take pieces back, or to cancel the whole bill. Both wait for approval. */
export function ReturnRequest({
  saleId,
  items,
  locations,
  canCancel,
}: {
  saleId: string;
  items: Item[];
  locations: { id: string; name: string }[];
  canCancel: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"" | "return" | "cancel">("");
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [loc, setLoc] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const left = items.filter((i) => i.qty - i.returned_qty > 0);
  const chosen = left.reduce((a, i) => a + (qty[i.id] ?? 0), 0);

  const send = (kind: "return" | "cancel") =>
    start(async () => {
      setMsg("");
      const r = await requestReturn({
        sale_id: saleId,
        kind,
        reason,
        location_id: loc,
        items: kind === "return" ? left.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ sale_item_id: i.id, qty: qty[i.id]! })) : [],
      });
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setOpen("");
      setQty({});
      setReason("");
      setMsg(`Request ${r.number} sent. Approve it on Returns / cancellations to put the pieces back into stock.`);
      router.refresh();
    });

  return (
    <div className="space-y-2 print:hidden">
      <div className="flex flex-wrap gap-2">
        {left.length > 0 && (
          <Button type="button" variant="secondary" onClick={() => setOpen(open === "return" ? "" : "return")}>Return pieces</Button>
        )}
        {canCancel && (
          <Button type="button" variant="danger" onClick={() => setOpen(open === "cancel" ? "" : "cancel")}>Cancel bill</Button>
        )}
      </div>
      {msg && <p className="rounded-lg border border-cream bg-white p-2 text-sm">{msg}</p>}
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(open);
          }}
          className="space-y-3 rounded-xl border border-cream bg-white p-4"
        >
          <p className="text-sm font-semibold">{open === "return" ? "Which pieces are coming back?" : "Cancel the whole bill"}</p>
          {open === "return" && (
            <ul className="divide-y divide-stone-100 text-sm">
              {left.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-24 font-mono">{i.sku}</span>
                  <span className="flex-1 truncate">{i.name} · {rupees(i.price)}</span>
                  <span className="text-xs text-muted">of {i.qty - i.returned_qty}</span>
                  <Input
                    type="number"
                    min="0"
                    max={i.qty - i.returned_qty}
                    value={qty[i.id] ?? 0}
                    onChange={(e) => setQty((q) => ({ ...q, [i.id]: Math.min(i.qty - i.returned_qty, Math.max(0, Number(e.target.value) || 0)) }))}
                    className="w-16"
                    aria-label={`Pieces of ${i.sku} returned`}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Reason">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Size did not fit, customer changed mind…" />
            </Field>
            {open === "return" && (
              <Field label="Put back at">
                <Select value={loc} onChange={(e) => setLoc(e.target.value)}>
                  <option value="">Where it was sold from</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <p className="text-xs text-muted">Stock changes only after the request is approved.</p>
          <Button disabled={pending || (open === "return" && chosen === 0)} variant={open === "cancel" ? "danger" : "primary"}>
            {pending ? "Sending…" : open === "return" ? `Request return of ${chosen} piece${chosen === 1 ? "" : "s"}` : "Request cancellation"}
          </Button>
        </form>
      )}
    </div>
  );
}
