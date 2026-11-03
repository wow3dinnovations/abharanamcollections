"use client";

import { useState, useTransition } from "react";
import { findForBill, saveTagSize, type BillProduct } from "@/app/shop-admin/actions";
import { Button, Card, Field, Input } from "@/components/admin/ui";
import { printHtml, tagHtml, tagSheetHtml, type TagItem } from "@/lib/shop/tags";

export function TagPrinter({ initial, width, height, brand }: { initial: TagItem[]; width: number; height: number; brand: string }) {
  const [items, setItems] = useState<TagItem[]>(initial);
  const [W, setW] = useState(width);
  const [H, setH] = useState(height);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<BillProduct[]>([]);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const add = (p: BillProduct) => {
    setItems((list) =>
      list.some((x) => x.id === p.id)
        ? list.map((x) => (x.id === p.id ? { ...x, copies: x.copies + 1 } : x))
        : [...list, { id: p.id, sku: p.sku, name: p.name, price: p.price, barcode: p.barcode, copies: 1 }],
    );
    setFound([]);
    setTerm("");
  };

  const search = () =>
    start(async () => {
      const r = await findForBill(term, "");
      if (r.length === 1) add(r[0]!);
      else setFound(r);
      if (!r.length) setMsg(`Nothing found for "${term}".`);
      else setMsg("");
    });

  const total = items.reduce((a, t) => a + Math.max(0, t.copies), 0);
  const sizeOk = W >= 10 && W <= 120 && H >= 8 && H <= 120;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); search(); }} className="flex gap-2">
          <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Scan or type a code to add" className="flex-1" autoFocus />
          <Button variant="secondary" disabled={pending || !term.trim()}>Add</Button>
        </form>
        {msg && <p className="text-sm text-muted">{msg}</p>}
        {found.length > 0 && (
          <ul className="divide-y rounded border border-cream bg-white text-sm">
            {found.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => add(p)} className="w-full px-3 py-2 text-left hover:bg-cream">
                  <b>{p.sku}</b> {p.name} · ₹{p.price}
                </button>
              </li>
            ))}
          </ul>
        )}
        <Card>
          {!items.length && <p className="text-sm text-muted">No products yet. Tick products on the Products page, or scan codes above.</p>}
          <ul className="divide-y divide-stone-100">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-28 font-mono font-medium">{t.sku}</span>
                <span className="flex-1 truncate">{t.name}</span>
                <span>₹{t.price}</span>
                <label className="flex items-center gap-1 text-xs text-muted">
                  Tags
                  <Input
                    type="number"
                    min="0"
                    max="500"
                    value={t.copies}
                    onChange={(e) => setItems((l) => l.map((x) => (x.id === t.id ? { ...x, copies: Math.min(500, Math.max(0, Number(e.target.value) || 0)) } : x)))}
                    className="w-16"
                  />
                </label>
                <button type="button" className="text-xs text-red-700 underline" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Tag size">
          <div className="flex items-end gap-2">
            <Field label="Width (mm)"><Input type="number" min="10" max="120" step="0.5" value={W} onChange={(e) => setW(Number(e.target.value))} className="w-20" /></Field>
            <Field label="Height (mm)"><Input type="number" min="8" max="120" step="0.5" value={H} onChange={(e) => setH(Number(e.target.value))} className="w-20" /></Field>
            <Button
              type="button"
              variant="secondary"
              disabled={!sizeOk || (W === width && H === height)}
              onClick={() => start(async () => { const r = await saveTagSize(W, H); setMsg(r.ok ? "Tag size saved." : r.error); })}
            >
              Keep
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">Udyama UDY 420B jewellery tag: 18 × 12 mm. In the print window choose that printer, paper size {W} × {H} mm, scale 100%, no margins.</p>
        </Card>
        <Card title="Preview (enlarged)">
          {items[0] && sizeOk ? (
            <div style={{ width: `${W * 4}mm`, height: `${H * 4}mm` }} className="overflow-hidden border border-dashed border-stone-300">
              <div style={{ transform: "scale(4)", transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: tagHtml(items[0], W, H, brand) }} />
            </div>
          ) : (
            <p className="text-sm text-muted">{sizeOk ? "Add a product to see its tag." : "Tag size must be 10–120 × 8–120 mm."}</p>
          )}
        </Card>
        <Button
          type="button"
          className="w-full py-2.5"
          disabled={!total || !sizeOk}
          onClick={() => printHtml(tagSheetHtml(items, W, H, brand))}
        >
          Print {total} tag{total === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
