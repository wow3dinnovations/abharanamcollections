"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { saveProduct, suggestCode, type ProductInput } from "@/app/shop-admin/actions";
import { Button, Field, Input, Select, Textarea } from "@/components/admin/ui";
import { uploadProductPhoto } from "@/lib/shop/photo";
import { BANGLE_SIZES, isBangleCategory } from "@/lib/shop/tags";

type Option = { id: string; name: string; is_active?: boolean };
export type ProductFormProps = {
  categories: Option[];
  subcategories: (Option & { category_id: string })[];
  vendors: Option[];
  locations: Option[];
  defaultMultiplier: number;
  /** Months of guarantee a "G" product gets (from the code settings). */
  guaranteeMonths: number;
  initial?: ProductInput & { id: string };
  /** New product with this code already filled in (from the dashboard's code lookup). */
  initialSku?: string;
};

const STICKY = "abh.shop.add-product"; // remembered on this device: vendor, location, category, multiplier
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function blank(multiplier: number): ProductInput {
  return {
    sku: "", name: "", category_id: "", subcategory_id: "", vendor_id: "", location_id: "",
    purchase_rate: "", multiplier: String(multiplier), price: "", mrp: "", opening_qty: "1",
    purchase_date: today(), invoice_no: "", rack: "", barcode: "", design_number: "", size: "", colour: "",
    material: "", collection: "", description: "", is_active: true, guarantee_months: "0", code_serial: null,
  };
}

const MATCH_TEXT: Record<string, string> = {
  category_vendor_location: "same category, vendor and location",
  category_location: "same category and location (first one from this vendor)",
  new: "first product in this category at this location",
  scheme: "from the code scheme (Vendors & settings)",
};

export function ProductForm(props: ProductFormProps) {
  const { initial } = props;
  const isNew = !initial;
  const router = useRouter();
  const [f, setF] = useState<ProductInput>(initial ?? { ...blank(props.defaultMultiplier), sku: props.initialSku ?? "" });
  const [skuTouched, setSkuTouched] = useState(!isNew || !!props.initialSku);
  const [priceTouched, setPriceTouched] = useState(!isNew);
  const [hint, setHint] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<{ id: string; sku: string }[]>([]);
  const [pending, start] = useTransition();
  const photoInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const loaded = useRef(!isNew);

  const set = (k: keyof ProductInput, v: string | boolean) => setF((old) => ({ ...old, [k]: v }));

  // New product: bring back the vendor, location, category and multiplier used last time.
  useEffect(() => {
    if (!isNew) return;
    try {
      const s = JSON.parse(localStorage.getItem(STICKY) ?? "{}");
      const ok = (list: Option[], id: unknown) => (typeof id === "string" && list.some((o) => o.id === id) ? id : "");
      setF((old) => ({
        ...old,
        vendor_id: ok(props.vendors, s.vendor_id),
        location_id: ok(props.locations, s.location_id),
        category_id: ok(props.categories, s.category_id),
        multiplier: s.multiplier ? String(s.multiplier) : old.multiplier,
      }));
    } catch {}
    loaded.current = true;
  }, [isNew, props.vendors, props.locations, props.categories]);

  useEffect(() => {
    if (!isNew || !loaded.current) return;
    try {
      localStorage.setItem(STICKY, JSON.stringify({ vendor_id: f.vendor_id, location_id: f.location_id, category_id: f.category_id, multiplier: f.multiplier }));
    } catch {}
  }, [isNew, f.vendor_id, f.location_id, f.category_id, f.multiplier]);

  // Next product code for this category + vendor + location (+ guarantee letter).
  const [codeTick, setCodeTick] = useState(0);
  const hasGuarantee = Number(f.guarantee_months) > 0;
  useEffect(() => {
    if (skuTouched || (!f.category_id && !f.vendor_id)) return;
    let live = true;
    suggestCode(f.category_id, f.vendor_id, f.location_id, hasGuarantee).then((r) => {
      if (!live) return;
      setF((old) => ({ ...old, sku: r.sku, code_serial: r.serial }));
      setHint(
        r.match === "scheme"
          ? `Serial ${r.serial}, ${MATCH_TEXT.scheme}`
          : r.based_on ? `Follows ${r.based_on}: ${MATCH_TEXT[r.match] ?? ""}` : r.sku ? (MATCH_TEXT.new ?? "") : "",
      );
    });
    return () => { live = false; };
  }, [f.category_id, f.vendor_id, f.location_id, hasGuarantee, skuTouched, codeTick]);

  // Selling price = purchase rate x multiplier (until the price is typed by hand).
  const auto = (() => {
    const r = Number(f.purchase_rate), m = Number(f.multiplier);
    return f.purchase_rate !== "" && Number.isFinite(r) && Number.isFinite(m) && m > 0 ? String(Math.round(r * m)) : "";
  })();
  useEffect(() => {
    if (!priceTouched && auto !== "") setF((old) => (old.price === auto ? old : { ...old, price: auto }));
  }, [auto, priceTouched]);

  function submit(mode: "open" | "next") {
    setError("");
    start(async () => {
      const res = await saveProduct({ ...f, id: initial?.id, code_serial: skuTouched ? null : f.code_serial });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (photo) {
        try {
          await uploadProductPhoto(res.id, res.sku, photo);
        } catch (e) {
          setError(`Saved ${res.sku}, but ${e instanceof Error ? e.message : "the photo did not upload"}. Open the product to try the photo again.`);
        }
      }
      if (!isNew) {
        setSaved([{ id: res.id, sku: res.sku }]);
        router.refresh();
        return;
      }
      if (mode === "open") {
        router.push(`/shop-admin/products/${res.id}`);
        return;
      }
      setSaved((s) => [{ id: res.id, sku: res.sku }, ...s]);
      // Keep category, vendor, location, multiplier, name, date and invoice. Clear the rest.
      setF((old) => ({
        ...blank(Number(old.multiplier) || props.defaultMultiplier),
        category_id: old.category_id, subcategory_id: old.subcategory_id, vendor_id: old.vendor_id,
        location_id: old.location_id, multiplier: old.multiplier, name: old.name, purchase_date: old.purchase_date,
        invoice_no: old.invoice_no, collection: old.collection, material: old.material,
        // Bangles usually come in sets of one size: keep it for the next piece.
        size: bangle ? old.size : "",
      }));
      setPhoto(null);
      if (photoInput.current) photoInput.current.value = "";
      setSkuTouched(false);
      setPriceTouched(false);
      setCodeTick((t) => t + 1);
      nameInput.current?.focus();
    });
  }

  const subs = props.subcategories.filter((s) => s.category_id === f.category_id);
  const bangle = isBangleCategory(props.categories.find((c) => c.id === f.category_id)?.name);
  const activeOnly = (list: Option[], keep: string) => list.filter((o) => o.is_active !== false || o.id === keep);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(isNew ? "next" : "open");
      }}
      className="space-y-5"
    >
      {saved.length > 0 && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900" role="status">
          {isNew ? (
            <>
              Saved {saved.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ", "}
                  <Link href={`/shop-admin/products/${s.id}`} className="font-semibold underline">{s.sku}</Link>
                </span>
              ))}.{" "}
              <Link href={`/shop-admin/tags?${saved.map((s) => `id=${s.id}`).join("&")}`} className="font-semibold underline">
                Print {saved.length === 1 ? "its tag" : `tags for these ${saved.length}`}
              </Link>
            </>
          ) : (
            <>Saved. <Link href={`/shop-admin/tags?id=${saved[0]!.id}`} className="font-semibold underline">Print tag</Link></>
          )}
        </div>
      )}
      {error && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}

      <fieldset className="grid gap-3 rounded-xl border border-cream bg-white p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Where it is from {isNew && <span className="font-normal text-muted">(stays selected for the next product)</span>}</legend>
        <Field label="Category *">
          <Select required value={f.category_id} onChange={(e) => { set("category_id", e.target.value); set("subcategory_id", ""); }}>
            <option value="">Choose…</option>
            {activeOnly(props.categories, f.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Vendor">
          <Select value={f.vendor_id} onChange={(e) => set("vendor_id", e.target.value)}>
            <option value="">No vendor</option>
            {activeOnly(props.vendors, f.vendor_id).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </Field>
        <Field label="Location (bought for / kept at)">
          <Select value={f.location_id} onChange={(e) => set("location_id", e.target.value)}>
            <option value="">Choose…</option>
            {activeOnly(props.locations, f.location_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-cream bg-white p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Product</legend>
        <Field label="Product code *">
          <Input
            required
            value={f.sku}
            onChange={(e) => { set("sku", e.target.value.toUpperCase()); setSkuTouched(true); setHint(""); }}
            className="font-mono"
            placeholder={f.category_id ? "" : "Choose a category first"}
          />
          <span className="text-[11px] text-muted">
            {hint}
            {skuTouched && isNew && (
              <button type="button" className="ml-1 underline" onClick={() => { setSkuTouched(false); setCodeTick((t) => t + 1); }}>
                Use next code
              </button>
            )}
          </span>
        </Field>
        <Field label="Name *">
          <Input ref={nameInput} required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Temple jhumka" />
        </Field>
        <Field label="Sub-category">
          <Select value={f.subcategory_id} onChange={(e) => set("subcategory_id", e.target.value)} disabled={!subs.length}>
            <option value="">–</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        {bangle && (
          <Field label="Bangle size (printed on the tag)">
            <Select value={f.size} onChange={(e) => set("size", e.target.value)} className="font-medium">
              <option value="">Choose size…</option>
              {BANGLE_SIZES.map((z) => <option key={z} value={z}>{z}</option>)}
              {f.size && !BANGLE_SIZES.includes(f.size) && <option value={f.size}>{f.size}</option>}
            </Select>
          </Field>
        )}
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-cream bg-white p-4 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">Price</legend>
        <Field label="Purchase rate (₹)">
          <Input type="number" min="0" step="0.01" inputMode="decimal" value={f.purchase_rate} onChange={(e) => set("purchase_rate", e.target.value)} />
        </Field>
        <Field label="Multiplier (×)">
          <Input type="number" min="0.1" step="0.01" inputMode="decimal" value={f.multiplier} onChange={(e) => set("multiplier", e.target.value)} />
        </Field>
        <Field label="Selling price (₹) *">
          <Input required type="number" min="0" step="1" inputMode="decimal" value={f.price} onChange={(e) => { set("price", e.target.value); setPriceTouched(true); }} />
          <span className="text-[11px] text-muted">
            {!priceTouched ? (auto ? "Purchase rate × multiplier" : "") : auto && auto !== f.price ? (
              <button type="button" className="underline" onClick={() => { setPriceTouched(false); set("price", auto); }}>Use ₹{auto} (rate × multiplier)</button>
            ) : ""}
          </span>
        </Field>
        <Field label="MRP (crossed-out price, optional)">
          <Input type="number" min="0" step="1" value={f.mrp} onChange={(e) => set("mrp", e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 rounded-xl border border-cream bg-white p-4 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">Stock and purchase</legend>
        {isNew && (
          <Field label="Quantity">
            <Input type="number" min="0" step="1" value={f.opening_qty} onChange={(e) => set("opening_qty", e.target.value)} />
          </Field>
        )}
        <Field label="Purchase date">
          <Input type="date" value={f.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} />
        </Field>
        <Field label="Purchase invoice no.">
          <Input value={f.invoice_no} onChange={(e) => set("invoice_no", e.target.value)} />
        </Field>
        <Field label="Rack / box">
          <Input value={f.rack} onChange={(e) => set("rack", e.target.value)} />
        </Field>
        <Field label="Barcode (blank = automatic)">
          <Input value={f.barcode} onChange={(e) => set("barcode", e.target.value.trim())} className="font-mono" />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={hasGuarantee}
            onChange={(e) => set("guarantee_months", e.target.checked ? String(props.guaranteeMonths || 6) : "0")}
          />
          Manufacturer guarantee{hasGuarantee ? ` (${f.guarantee_months} months)` : ""}
        </label>
      </fieldset>

      <details className="rounded-xl border border-cream bg-white p-4" open={!isNew}>
        <summary className="cursor-pointer text-sm font-semibold">More details and photo</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Photo (main photo on the website)">
            <input ref={photoInput} type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-sm" />
          </Field>
          <Field label="Design number"><Input value={f.design_number} onChange={(e) => set("design_number", e.target.value)} /></Field>
          {!bangle && <Field label="Size (printed on the tag)"><Input value={f.size} onChange={(e) => set("size", e.target.value)} /></Field>}
          <Field label="Colour"><Input value={f.colour} onChange={(e) => set("colour", e.target.value)} /></Field>
          <Field label="Material"><Input value={f.material} onChange={(e) => set("material", e.target.value)} /></Field>
          <Field label="Collection"><Input value={f.collection} onChange={(e) => set("collection", e.target.value)} placeholder="Bridal, Temple…" /></Field>
          <div className="sm:col-span-3">
            <Field label="Description (shown on the website)">
              <Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.is_active} onChange={(e) => set("is_active", e.target.checked)} /> In use (show on the website)
          </label>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        {isNew ? (
          <>
            <Button disabled={pending}>{pending ? "Saving…" : "Save & add next"}</Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => submit("open")}>Save & open</Button>
          </>
        ) : (
          <Button disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        )}
      </div>
    </form>
  );
}
