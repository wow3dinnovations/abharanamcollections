import { Button, Card, Field, Input, PageHeader } from "@/components/admin/ui";
import { getMasters } from "@/lib/shop/server";
import { saveLocation, saveShopCategory, saveShopSettings, saveVendor } from "../actions";

export default async function SetupPage() {
  const m = await getMasters();
  return (
    <div className="space-y-6">
      <PageHeader title="Vendors & settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Shop locations">
          <div className="space-y-2">
            {m.locations.map((l) => (
              <form key={l.id} action={saveLocation} className="flex flex-wrap items-center gap-2 text-sm">
                <input type="hidden" name="id" value={l.id} />
                <Input name="name" defaultValue={l.name} className="flex-1" aria-label="Location name" />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_active" defaultChecked={l.is_active} /> In use</label>
                <Button variant="secondary">Save</Button>
              </form>
            ))}
          </div>
          <form action={saveLocation} className="mt-4 flex gap-2 border-t border-cream pt-4">
            <Input name="name" placeholder="New location, e.g. Hyderabad" className="flex-1" required />
            <Button>Add</Button>
          </form>
        </Card>
        <Card title="Vendors">
          <div className="space-y-2">
            {m.vendors.map((v) => (
              <form key={v.id} action={saveVendor} className="flex flex-wrap items-center gap-2 text-sm">
                <input type="hidden" name="id" value={v.id} />
                <Input name="name" defaultValue={v.name} className="min-w-32 flex-1" aria-label="Vendor name" />
                <Input name="phone" defaultValue={v.phone} placeholder="Phone" className="w-32" aria-label="Vendor phone" />
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="is_active" defaultChecked={v.is_active} /> In use</label>
                <Button variant="secondary">Save</Button>
              </form>
            ))}
          </div>
          <form action={saveVendor} className="mt-4 flex flex-wrap gap-2 border-t border-cream pt-4">
            <Input name="name" placeholder="New vendor name" className="flex-1" required />
            <Input name="phone" placeholder="Phone" className="w-32" />
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
