import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Button, Card, Field, Input, PageHeader, Select } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/shop/ConfirmButton";
import { getMasters } from "@/lib/shop/server";
import { requireAdmin } from "@/lib/admin";
import {
  deleteVendor,
  enableShopCategory,
  restoreVendor,
  saveCodeSettings,
  saveLocation,
  saveShopCategory,
  saveShopSettings,
  saveVendor,
} from "../actions";
/** An example code with the current settings, like IB850G. */
function example(pattern: string, type: string, loc: string, vendor: number, serial: number, digits: number, g: string) {
  return pattern
    .replaceAll("{TYPE}", type)
    .replaceAll("{LOC}", loc)
    .replaceAll("{VENDOR}", String(vendor))
    .replaceAll("{SERIAL}", String(serial).padStart(digits, "0"))
    .replaceAll("{G}", g);
}

/** A section that stays closed until it is clicked, for settings that are rarely changed. */
function More({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-cream bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4">
        <span>
          <span className="font-semibold">{title}</span>
          <span className="block text-xs text-muted">{note}</span>
        </span>
        <span className="text-sm text-muted group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-cream p-4">{children}</div>
    </details>
  );
}

export default async function SetupPage() {
  const m = await getMasters();
  const { supabase } = await requireAdmin();
  const st = m.settings;
  const locName = (id: string | null) => m.locations.find((l) => l.id === id);
  const shopSerial = st.serial_scope === "shop";
  const vendors = m.vendors.filter((v) => v.is_active);
  const deleted = m.vendors.filter((v) => !v.is_active);
  // How many products each vendor has (shown in the list, and in the delete question).
  const counts = new Map(
    await Promise.all(
      m.vendors.map(async (v) => {
        const { count } = await supabase.from("shop_products").select("product_id", { count: "exact", head: true }).eq("vendor_id", v.id);
        return [v.id, count ?? 0] as const;
      }),
    ),
  );
  const nextCode = (v: (typeof m.vendors)[number]) =>
    v.code_no === null
      ? ""
      : example(st.code_pattern, st.code_type, locName(v.location_id)?.code ?? "", v.code_no, shopSerial ? st.next_serial : v.next_serial, st.serial_digits, "");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Vendors & settings" />

      <Card title="Add new vendor">
        <form action={saveVendor} className="flex flex-wrap items-end gap-3">
          <Field label="Vendor name"><Input name="name" placeholder="e.g. Sri Lakshmi Jewels" className="w-56" required /></Field>
          <Field label="Phone"><Input name="phone" type="tel" placeholder="Optional" className="w-36" /></Field>
          <Field label="City">
            <Select name="location_id" defaultValue={m.locations.length === 1 ? m.locations[0]!.id : ""} className="w-36">
              <option value="">Choose…</option>
              {m.locations.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Button>Add vendor</Button>
        </form>
        <p className="mt-2 text-xs text-muted">The vendor number for product codes is given automatically (the next number in that city).</p>
      </Card>

      <Card title={`Vendors (${vendors.length})`}>
        {!vendors.length && <p className="text-sm text-muted">No vendors yet. Add one above.</p>}
        <ul className="divide-y divide-cream">
          {vendors.map((v) => {
            const n = counts.get(v.id) ?? 0;
            const code = nextCode(v);
            return (
              <li key={v.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <div className="min-w-48 flex-1">
                    <div className="font-medium">{v.name}</div>
                    <div className="text-xs text-muted">
                      {[v.phone, locName(v.location_id)?.name, v.code_no !== null ? `Vendor no. ${v.code_no}` : "No vendor number"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="text-sm">
                    <Link href={`/shop-admin/products?vendor=${v.id}`} className="underline">{n} product{n === 1 ? "" : "s"}</Link>
                  </div>
                  {code && <div className="text-xs text-muted">Next code <span className="font-mono text-ink">{code}</span></div>}
                  <form action={deleteVendor}>
                    <input type="hidden" name="id" value={v.id} />
                    <ConfirmButton
                      variant="danger"
                      message={
                        n
                          ? `Delete ${v.name}?\n\nTheir ${n} product${n === 1 ? "" : "s"} and old bills stay as they are and keep the vendor's name. ${v.name} will no longer be offered when adding products.`
                          : `Delete ${v.name}? This cannot be undone.`
                      }
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-maroon underline">Edit details</summary>
                  <form action={saveVendor} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-cream/30 p-3 text-sm">
                    <input type="hidden" name="id" value={v.id} />
                    <Field label="Name"><Input name="name" defaultValue={v.name} className="w-48" required /></Field>
                    <Field label="Phone"><Input name="phone" type="tel" defaultValue={v.phone} className="w-32" /></Field>
                    <Field label="City">
                      <Select name="location_id" defaultValue={v.location_id ?? ""} className="w-32">
                        <option value="">–</option>
                        {m.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </Select>
                    </Field>
                    <Field label="Vendor no."><Input name="code_no" type="number" min="0" max="9999" defaultValue={v.code_no ?? ""} className="w-20" /></Field>
                    {!shopSerial && <Field label="Next serial"><Input name="next_serial" type="number" min="0" defaultValue={v.next_serial} className="w-24" /></Field>}
                    <Button variant="secondary">Save</Button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
        {deleted.length > 0 && (
          <details className="mt-4 border-t border-cream pt-3 text-sm">
            <summary className="cursor-pointer text-xs text-muted">Deleted vendors ({deleted.length}): kept because old products and bills use them</summary>
            <ul className="mt-2 space-y-2">
              {deleted.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3">
                  <span className="flex-1">{v.name} <Badge>Deleted</Badge> <span className="text-xs text-muted">{counts.get(v.id) ?? 0} products</span></span>
                  <form action={restoreVendor}>
                    <input type="hidden" name="id" value={v.id} />
                    <Button variant="secondary">Bring back</Button>
                  </form>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>

      <Card title="Categories">
        <div className="grid gap-2 sm:grid-cols-2">
          {m.categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <form action={saveShopCategory} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="id" value={c.id} />
                <Input name="name" defaultValue={c.name} className="min-w-32 flex-1" aria-label="Category name" required />
                <Button variant="secondary">Save</Button>
              </form>
              {!c.is_active && (
                <form action={enableShopCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <Button variant="secondary" title="This category is switched off">Turn on</Button>
                </form>
              )}
            </div>
          ))}
        </div>
        <form action={saveShopCategory} className="mt-4 flex gap-2 border-t border-cream pt-4">
          <Input name="name" placeholder="New category, e.g. Earrings" className="flex-1" required />
          <Button>Add category</Button>
        </form>
      </Card>

      <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted">More settings</h2>
      <More title="Shop locations" note="Cities and their code letter (B for Bangalore)">
        <div className="space-y-2">
          {m.locations.map((l) => (
            <form key={l.id} action={saveLocation} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="id" value={l.id} />
              <Input name="name" defaultValue={l.name} className="flex-1" aria-label="Location name" />
              <Input name="code" defaultValue={l.code ?? ""} placeholder="Code" className="w-16 uppercase" maxLength={4} aria-label={`Code letter for ${l.name}`} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_active" defaultChecked={l.is_active} /> In use</label>
              <Button variant="secondary">Save</Button>
            </form>
          ))}
        </div>
        <form action={saveLocation} className="mt-4 flex gap-2 border-t border-cream pt-4">
          <Input name="name" placeholder="New location, e.g. Hyderabad" className="flex-1" required />
          <Input name="code" placeholder="Code, e.g. H" className="w-28 uppercase" maxLength={4} />
          <Button>Add</Button>
        </form>
      </More>
      <More title="Product codes" note={`How codes are made, e.g. ${example(st.code_pattern, st.code_type, "B", 8, 50, st.serial_digits, st.guarantee_letter)}`}>
        <p className="mb-3 text-xs text-muted">
          A code is made from parts: {"{TYPE}"} = type letter (I for Imitation), {"{LOC}"} = location code (B), {"{VENDOR}"} = vendor number (8),
          {" {SERIAL}"} = serial number (50), {"{G}"} = guarantee letter when the product has a guarantee. Change the order or add - if you like.
          Vendors without a number keep the old codes (ABH-ER-000001).
        </p>
        <form action={saveCodeSettings} className="grid gap-3 sm:grid-cols-4">
          <Field label="Pattern"><Input name="code_pattern" defaultValue={st.code_pattern} className="font-mono" required /></Field>
          <Field label="Type letter (I = Imitation)"><Input name="code_type" defaultValue={st.code_type} maxLength={4} className="uppercase" /></Field>
          <Field label="Guarantee letter"><Input name="guarantee_letter" defaultValue={st.guarantee_letter} maxLength={4} className="uppercase" /></Field>
          <Field label="Guarantee (months)"><Input name="guarantee_months" type="number" min="0" max="120" defaultValue={st.guarantee_months} /></Field>
          <Field label="Serial numbers">
            <Select name="serial_scope" defaultValue={st.serial_scope}>
              <option value="vendor">Separate for each vendor</option>
              <option value="shop">One shop serial for all</option>
            </Select>
          </Field>
          <Field label="Shop serial number (next)"><Input name="next_serial" type="number" min="0" defaultValue={st.next_serial} /></Field>
          <Field label="Serial digits (0 = no zeros)"><Input name="serial_digits" type="number" min="0" max="9" defaultValue={st.serial_digits} /></Field>
          <div className="flex items-end"><Button>Save code settings</Button></div>
        </form>
        <p className="mt-3 text-xs text-muted">
          Example: <span className="font-mono">{example(st.code_pattern, st.code_type, "B", 8, 50, st.serial_digits, st.guarantee_letter)}</span>
          {" "}(Bangalore, vendor 8, serial 50, with guarantee). The shop serial number is used only when serial numbers are set to “One shop serial for all”.
        </p>
      </More>
      <More title="Price, tags and bills" note="Selling price multiplier, tag size, bill footer">
        <form action={saveShopSettings} className="grid gap-3 sm:grid-cols-4">
          <Field label="Selling price = purchase rate ×">
            <Input name="default_multiplier" type="number" step="0.01" min="0.1" defaultValue={m.settings.default_multiplier} />
          </Field>
          <Field label="Tag width (mm)"><Input name="tag_width_mm" type="number" step="0.5" defaultValue={m.settings.tag_width_mm} /></Field>
          <Field label="Tag height (mm)"><Input name="tag_height_mm" type="number" step="0.5" defaultValue={m.settings.tag_height_mm} /></Field>
          <Field label="Line at the bottom of bills"><Input name="bill_footer" defaultValue={m.settings.bill_footer} /></Field>
          <div><Button>Save settings</Button></div>
        </form>
        <p className="mt-3 text-xs text-muted">Shop name, phone and address on bills come from Website admin → Settings.</p>
      </More>
    </div>
  );
}
