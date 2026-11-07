"use client";

import { useState, useTransition } from "react";
import { findForBill, saveTagLayout, type BillProduct } from "@/app/shop-admin/actions";
import { Button, Card, Field, Input, Select } from "@/components/admin/ui";
import { DEFAULT_LAYOUT, LAYOUT_LIMITS, printHtml, readLayout, tagHtml, tagSheetHtml, type TagItem, type TagLayout } from "@/lib/shop/tags";

const SAMPLE: TagItem = { id: "sample", sku: "IB850G", name: "Dollar", price: 499, barcode: "100023", copies: 1 };

export function TagPrinter({
  initial,
  width,
  height,
  brand,
  layout,
}: {
  initial: TagItem[];
  width: number;
  height: number;
  brand: string;
  layout: unknown;
}) {
  const [items, setItems] = useState<TagItem[]>(initial);
  const [W, setW] = useState(width);
  const [H, setH] = useState(height);
  const [saved, setSaved] = useState(() => JSON.stringify({ W: width, H: height, L: readLayout(layout) }));
  const [L, setL] = useState<TagLayout>(() => readLayout(layout));
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<BillProduct[]>([]);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
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
      const r = await findForBill(term);
      if (r.length === 1) add(r[0]!);
      else setFound(r);
      if (!r.length) setMsg(`Nothing found for "${term}".`);
      else setMsg("");
    });

  const set = <K extends keyof TagLayout>(k: K, v: TagLayout[K]) => {
    setNote("");
    setL((old) => ({ ...old, [k]: v }));
  };
  const num = (k: keyof TagLayout, label: string, step = 0.5) => {
    const [min, max] = LAYOUT_LIMITS[k] ?? [0, 120];
    return (
      <Field label={label}>
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={L[k] as number}
          onChange={(e) => set(k, (e.target.value === "" ? 0 : Number(e.target.value)) as never)}
          className="w-20"
        />
      </Field>
    );
  };
  const nudge = (k: "offset_x" | "offset_y", d: number) =>
    set(k, Math.round(Math.min(LAYOUT_LIMITS[k]![1], Math.max(LAYOUT_LIMITS[k]![0], L[k] + d)) * 10) / 10);

  const total = items.reduce((a, t) => a + Math.max(0, t.copies), 0);
  const sizeOk = W >= 10 && W <= 120 && H >= 8 && H <= 120;
  const clean = readLayout(L);
  const dirty = JSON.stringify({ W, H, L: clean }) !== saved;
  const preview = items[0] ?? SAMPLE;
  const scale = Math.min(4, 760 / (W * 3.78)); // fits the card on a laptop screen

  return (
    <div className="space-y-6">
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

        <div className="space-y-3">
          <Button type="button" className="w-full py-2.5" disabled={!total || !sizeOk} onClick={() => printHtml(tagSheetHtml(items, W, H, brand, clean))}>
            Print {total} tag{total === 1 ? "" : "s"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={!sizeOk}
            onClick={() => printHtml(tagSheetHtml([{ ...preview, copies: 1 }], W, H, brand, clean, true))}
          >
            Test print one tag with outline
          </Button>
          <p className="text-xs text-muted">
            In the print window choose the tag printer, paper size {W} × {H} mm, scale 100% (or “Actual size”), margins none.
            If the print sits too far left or right, change <b>Move left / right</b> below and print a test tag again.
          </p>
        </div>
      </div>

      <Card title="Tag layout">
        <div className="mb-4 overflow-x-auto">
          {sizeOk ? (
            <div style={{ width: `${W * scale}mm`, height: `${H * scale}mm` }} className="overflow-hidden bg-stone-50">
              <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }} dangerouslySetInnerHTML={{ __html: tagHtml(preview, W, H, brand, clean, true) }} />
            </div>
          ) : (
            <p className="text-sm text-muted">Tag size must be 10–120 × 8–120 mm.</p>
          )}
          <p className="mt-1 text-[11px] text-muted">Enlarged. The gold line is the paper tag and the dashed line its fold; they are not printed.</p>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Tag type">
              <Select value={L.style} onChange={(e) => set("style", e.target.value as TagLayout["style"])}>
                <option value="jewellery">Jewellery tag with tail (PID, name, price + barcode)</option>
                <option value="small">Small tag (price, barcode, number)</option>
              </Select>
            </Field>
            <Field label="Width (mm)"><Input type="number" min="10" max="120" step="0.5" value={W} onChange={(e) => setW(Number(e.target.value))} className="w-20" /></Field>
            <Field label="Height (mm)"><Input type="number" min="8" max="120" step="0.5" value={H} onChange={(e) => setH(Number(e.target.value))} className="w-20" /></Field>
          </div>

          <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border border-cream p-3">
            <legend className="px-1 text-xs font-semibold">Printer alignment (moves everything)</legend>
            {num("offset_x", "Move left (−) / right (+) mm", 0.1)}
            <div className="flex gap-1 pb-0.5">
              <Button type="button" variant="secondary" onClick={() => nudge("offset_x", -0.5)} aria-label="Move left">←</Button>
              <Button type="button" variant="secondary" onClick={() => nudge("offset_x", 0.5)} aria-label="Move right">→</Button>
            </div>
            {num("offset_y", "Move up (−) / down (+) mm", 0.1)}
            <div className="flex gap-1 pb-0.5">
              <Button type="button" variant="secondary" onClick={() => nudge("offset_y", -0.5)} aria-label="Move up">↑</Button>
              <Button type="button" variant="secondary" onClick={() => nudge("offset_y", 0.5)} aria-label="Move down">↓</Button>
            </div>
          </fieldset>

          {L.style === "jewellery" && (
            <>
              <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border border-cream p-3">
                <legend className="px-1 text-xs font-semibold">Text (left of the fold)</legend>
                {num("text_x", "Starts at (mm)")}
                {num("text_width", "Width (mm)")}
                {num("font_size", "Letter size (mm)", 0.1)}
                <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={L.bold} onChange={(e) => set("bold", e.target.checked)} /> Bold</label>
                <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={L.uppercase} onChange={(e) => set("uppercase", e.target.checked)} /> CAPITALS</label>
              </fieldset>
              <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border border-cream p-3">
                <legend className="px-1 text-xs font-semibold">Lines</legend>
                <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={L.show_code} onChange={(e) => set("show_code", e.target.checked)} /> Code</label>
                <Field label="Code label"><Input value={L.label_code} maxLength={20} onChange={(e) => set("label_code", e.target.value)} className="w-24" /></Field>
                <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={L.show_name} onChange={(e) => set("show_name", e.target.checked)} /> Name</label>
                <Field label="Name label"><Input value={L.label_name} maxLength={20} onChange={(e) => set("label_name", e.target.value)} className="w-24" /></Field>
                <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={L.show_price} onChange={(e) => set("show_price", e.target.checked)} /> Price</label>
                <Field label="Price label"><Input value={L.label_price} maxLength={20} onChange={(e) => set("label_price", e.target.value)} className="w-24" /></Field>
                <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={L.rupee} onChange={(e) => set("rupee", e.target.checked)} /> ₹ sign</label>
              </fieldset>
              <fieldset className="flex flex-wrap items-end gap-3 rounded-lg border border-cream p-3">
                <legend className="px-1 text-xs font-semibold">Barcode (right of the fold)</legend>
                {num("barcode_x", "Starts at (mm)")}
                {num("barcode_width", "Width (mm)")}
                {num("barcode_height", "Height (mm)")}
                <label className="flex items-center gap-1 pb-2 text-sm"><input type="checkbox" checked={L.barcode_text} onChange={(e) => set("barcode_text", e.target.checked)} /> Number under it</label>
              </fieldset>
            </>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Barcode holds">
              <Select value={L.barcode_value} onChange={(e) => set("barcode_value", e.target.value as TagLayout["barcode_value"])}>
                <option value="sku">Product code (IB850G)</option>
                <option value="barcode">Barcode number (100023)</option>
              </Select>
            </Field>
            <Button
              type="button"
              disabled={!sizeOk || !dirty || pending}
              onClick={() =>
                start(async () => {
                  const r = await saveTagLayout(W, H, clean);
                  if (r.ok) setSaved(JSON.stringify({ W, H, L: clean }));
                  setNote(r.ok ? "Saved. It is used every time you print." : r.error);
                })
              }
            >
              Keep this layout
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setL({ ...DEFAULT_LAYOUT, offset_x: L.offset_x, offset_y: L.offset_y }); setW(80); setH(12); }}>
              Back to 80 × 12 mm standard
            </Button>
            {note ? <span className="pb-2 text-xs text-muted">{note}</span> : dirty && <span className="pb-2 text-xs text-amber-700">Not kept yet</span>}
          </div>
          <p className="text-xs text-muted">Both the product code and the barcode number can be scanned at billing.</p>
        </div>
      </Card>
    </div>
  );
}
