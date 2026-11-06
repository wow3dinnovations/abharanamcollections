import { Button, Card, Field, Input, PageHeader, Select } from "@/components/admin/ui";
import { getMasters } from "@/lib/shop/server";
import { saveCodeSettings, saveLocation, saveShopCategory, saveShopSettings, saveVendor } from "../actions";

/** An example code with the current settings, like IB850G. */
function example(pattern: string, type: string, loc: string, vendor: number, serial: number, digits: number, g: string) {
  return pattern
    .replaceAll("{TYPE}", type)
    .replaceAll("{LOC}", loc)
    .replaceAll("{VENDOR}", String(vendor))
    .replaceAll("{SERIAL}", String(serial).padStart(digits, "0"))
    .replaceAll("{G}", g);
}

export default async function SetupPage() {
  const m = await getMasters();
  const st = m.settings;
  const locName = (id: string | null) => m.locations.find((l) => l.id === id);
  const shopSerial = st.serial_scope === "shop";
  return (
    <div className="space-y-6">
      <PageHeader title="Vendors & settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Shop locations">
          <p className="mb-3 text-xs text-muted">The code goes into product codes: B for Bangalore makes IB850G.</p>
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
        </Card>
        <Card title="Vendors">
          <p className="mb-3 text-xs text-muted">
            City and number go into product codes: the 8th vendor in Bangalore is number 8, so its products are IB8….
            {shopSerial ? " Serial numbers are shared by the whole shop (see Product codes)." : " Next serial is the number its next product gets (50 in IB850G)."}
          </p>
          <div className="space-y-3">
            {m.vendors.map((v) => (
              <form key={v.id} action={saveVendor} className="flex flex-wrap items-end gap-2 text-sm">
                <input type="hidden" name="id" value={v.id} />
                <Field label="Name"><Input name="name" defaultValue={v.name} className="w-36" /></Field>
                <Field label="Phone"><Input name="phone" defaultValue={v.phone} className="w-28" /></Field>
                <Field label="City">
                  <Select name="location_id" defaultValue={v.location_id ?? ""} className="w-28">
                    <option value="">–</option>
                    {m.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Select>
                </Field>
                <Field label="Vendor no."><Input name="code_no" type="number" min="0" max="9999" defaultValue={v.code_no ?? ""} className="w-16" /></Field>
                {!shopSerial && <Field label="Next serial"><Input name="next_serial" type="number" min="0" defaultValue={v.next_serial} className="w-20" /></Field>}
                <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="is_active" defaultChecked={v.is_active} /> In use</label>
                <Button variant="secondary">Save</Button>
                {v.code_no !== null && (
                  <span className="pb-2 font-mono text-xs text-muted">
                    {example(st.code_pattern, st.code_type, locName(v.location_id)?.code ?? "", v.code_no, shopSerial ? st.next_serial : v.next_serial, st.serial_digits, "")}
                  </span>
                )}
              </form>
            ))}
          </div>
          <form action={saveVendor} className="mt-4 flex flex-wrap items-end gap-2 border-t border-cream pt-4">
            <Input name="name" placeholder="New vendor name" className="flex-1" required />
            <Input name="phone" placeholder="Phone" className="w-28" />
            <Select name="location_id" defaultValue="" className="w-28" aria-label="City">
              <option value="">City…</option>
              {m.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
            <Input name="code_no" type="number" min="0" max="9999" placeholder="No. (auto)" className="w-24" aria-label="Vendor number" />
            <Button>Add</Button>
          </form>
        </Card>
      </div>
      <Card title="Categories">
        <p className="mb-3 text-xs text-muted">The short code (like ER for Earrings) starts new product codes: ABH-ER-000001. Order, photo and description for the website are in Website admin → Categories.</p>
        <div className="grid gap-2 lg:grid-cols-2">
          {m.categories.map((c) => (
            <form key={c.id} action={saveShopCategory} className="flex flex-wrap items-center gap-2 text-sm">
              <input type="hidden" name="id" value={c.id} />
              <Input name="name" defaultValue={c.name} className="min-w-32 flex-1" aria-label="Category name" />
              <Input name="code" defaultValue={c.code ?? ""} placeholder="Code" className="w-20 uppercase" aria-label="Category code" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_active" defaultChecked={c.is_active} /> In use</label>
              <Button variant="secondary">Save</Button>
            </form>
          ))}
        </div>
        <form action={saveShopCategory} className="mt-4 flex flex-wrap gap-2 border-t border-cream pt-4">
          <Input name="name" placeholder="New category, e.g. Earrings" className="flex-1" required />
          <Input name="code" placeholder="Code, e.g. ER" className="w-28 uppercase" />
          <Button>Add</Button>
        </form>
      </Card>
      <Card title="Product codes">
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
      </Card>
      <Card title="Settings">
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
      </Card>
    </div>
  );
}
